import { Logger, UseFilters, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { ERROR_CODES, SOCKET_EVENTS } from "@soundwithme/constants";
import {
  nextEventSchema,
  queueAddEventSchema,
  queueAddManyEventSchema,
  queueRemoveEventSchema,
  queueVoteEventSchema,
  skipVoteEventSchema,
  type NextEventInput,
  type QueueVoteEventInput,
  type SkipVoteEventInput,
  type QueueAddEventInput,
  type QueueAddManyEventInput,
  type QueueRemoveEventInput,
} from "@soundwithme/validation";
import type { QueueItem } from "@soundwithme/types";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { QueueService } from "../../modules/queue/queue.service";
import { PlaybackService } from "../../modules/playback/playback.service";
import { RoomsService } from "../../modules/rooms/rooms.service";
import { AppEventsService } from "../../common/events/app-events.service";
import { WsExceptionFilter } from "../ws-exception.filter";
import { RATE_LIMITS, assertJoined, consumeRateLimit } from "../socket-guards";
import type { AppServer, AppSocket } from "../realtime.types";

/** How often the server looks for songs that have ended. */
const ADVANCE_TICK_MS = 1_000;
/** Tabs usually report a song's end themselves; the server steps in this long after it. */
const ADVANCE_GRACE_MS = 1_200;
/** An end left behind by a room this server doesn't know (another deployment's database) is dropped after this. */
const FOREIGN_END_TTL_MS = 24 * 60 * 60_000;

/** Shared room queue. Permissions are checked against the stored room in QueueService. */
@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: "/" })
export class QueueGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueGateway.name);
  private advanceTimer: NodeJS.Timeout | null = null;
  private advancing = false;

  @WebSocketServer()
  private readonly server!: AppServer;

  constructor(
    private readonly queueService: QueueService,
    private readonly playbackService: PlaybackService,
    private readonly roomsService: RoomsService,
    private readonly events: AppEventsService,
  ) {}

  onModuleDestroy(): void {
    if (this.advanceTimer) clearInterval(this.advanceTimer);
  }

  onModuleInit(): void {
    this.advanceTimer = setInterval(() => void this.advanceEndedSongs(), ADVANCE_TICK_MS).unref();

    // A new song starts with a clean slate of skip votes.
    this.events.on("room.trackChanged", async ({ roomId, trackId }) => {
      await this.queueService.clearSkipVotes(roomId, trackId);
      const listeners = await this.listenerCount(roomId);
      this.server.to(roomId).emit(SOCKET_EVENTS.SKIP_STATE, await this.queueService.skipState(roomId, trackId, listeners));
    });

    // A lobby room freshened itself up (songs added, next song started).
    this.events.on("room.lobbyRefreshed", ({ roomId, state, queue }) => {
      if (state) this.server.to(roomId).emit(SOCKET_EVENTS.PLAYBACK_STATE, state);
      this.broadcastQueue(roomId, queue);
    });
  }

  @SubscribeMessage(SOCKET_EVENTS.QUEUE_ADD)
  async onQueueAdd(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(queueAddEventSchema)) { roomId, trackId }: QueueAddEventInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.queue);
    const queue = await this.inSendOrder(client, () => this.queueService.add(roomId, client.data.user, trackId));
    this.broadcastQueue(roomId, queue);
  }

  /** A paste of several links: one rate-limit hit, one broadcast. */
  @SubscribeMessage(SOCKET_EVENTS.QUEUE_ADD_MANY)
  async onQueueAddMany(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(queueAddManyEventSchema)) { roomId, trackIds }: QueueAddManyEventInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.queue);
    const queue = await this.inSendOrder(client, () => this.queueService.addMany(roomId, client.data.user, trackIds));
    this.broadcastQueue(roomId, queue);
  }

  @SubscribeMessage(SOCKET_EVENTS.QUEUE_REMOVE)
  async onQueueRemove(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(queueRemoveEventSchema)) { roomId, queueItemId }: QueueRemoveEventInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.queue);
    const queue = await this.inSendOrder(client, () =>
      this.queueService.remove(roomId, client.data.user.id, queueItemId),
    );
    this.broadcastQueue(roomId, queue);
  }

  /** Thumbs up / down on a queued song; the queue re-sorts for everyone. */
  @SubscribeMessage(SOCKET_EVENTS.QUEUE_VOTE)
  async onQueueVote(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(queueVoteEventSchema)) { roomId, queueItemId, value }: QueueVoteEventInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.vote);
    const queue = await this.inSendOrder(client, () =>
      this.queueService.vote(roomId, client.data.user.id, queueItemId, value),
    );
    this.broadcastQueue(roomId, queue);
  }

  /** Vote to skip the current song; half the room (rounded up) moves it on. */
  @SubscribeMessage(SOCKET_EVENTS.SKIP_VOTE)
  async onSkipVote(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(skipVoteEventSchema)) { roomId, vote }: SkipVoteEventInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.vote);
    const listeners = await this.listenerCount(roomId);
    const result = await this.queueService.voteSkip(roomId, client.data.user.id, vote, listeners);
    if (result.advanced) {
      // SKIP_STATE for the new song follows from the trackChanged event.
      this.server.to(roomId).emit(SOCKET_EVENTS.PLAYBACK_STATE, result.advanced.state);
      this.broadcastQueue(roomId, result.advanced.queue);
      return;
    }
    this.server.to(roomId).emit(SOCKET_EVENTS.SKIP_STATE, result.skip);
  }

  /**
   * Skip / auto-advance. Stale requests (playback already moved past
   * `fromVersion`) are dropped silently — that is the normal outcome when
   * several clients report the same track ending.
   */
  @SubscribeMessage(SOCKET_EVENTS.NEXT)
  async onNext(
    @ConnectedSocket() client: AppSocket,
    @MessageBody(new ZodValidationPipe(nextEventSchema)) { roomId, fromVersion, ended }: NextEventInput,
  ): Promise<void> {
    assertJoined(client, roomId);
    consumeRateLimit(client, RATE_LIMITS.playbackControl);
    const result = await this.queueService.playNext(roomId, client.data.user.id, fromVersion, ended === true);
    if (!result) return;
    this.server.to(roomId).emit(SOCKET_EVENTS.PLAYBACK_STATE, result.state);
    this.broadcastQueue(roomId, result.queue);
  }

  /**
   * Nest runs handlers for one socket concurrently, so two quick QUEUE_ADDs
   * could land in the queue reversed. Chaining per socket keeps the user's
   * own operations in the order they sent them (other sockets stay parallel).
   * The task's own result/error is returned to the caller unchanged; the
   * stored tail only needs to settle, so its rejection is deliberately
   * ignored there (it is already reported through the returned promise).
   */
  private inSendOrder<T>(client: AppSocket, task: () => Promise<T>): Promise<T> {
    const previous = client.data.queueOps ?? Promise.resolve();
    const run = previous.then(task);
    client.data.queueOps = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Moves every room whose song is over on to its next one, by the server's
   * clock: a room never waits for a tab to notice (hidden tabs are
   * throttled, phones sleep, nobody may be connected at all). Tabs that see
   * the end first still advance it at once; the version check lets exactly
   * one advance through, so the two never double-skip.
   */
  private async advanceEndedSongs(): Promise<void> {
    if (this.advancing) return;
    this.advancing = true;
    try {
      for (const { roomId, endsAt } of await this.playbackService.roomsDueToEnd(Date.now() - ADVANCE_GRACE_MS)) {
        try {
          // Not a live room here: another server sharing this Redis may own it (a dev machine and its tests).
          if (!(await this.roomsService.findRoomSettings(roomId))) {
            if (endsAt < Date.now() - FOREIGN_END_TTL_MS) await this.playbackService.unscheduleEnd(roomId);
            continue;
          }
          if (!(await this.playbackService.getPlaybackState(roomId))) {
            await this.playbackService.unscheduleEnd(roomId);
            continue;
          }
          const { needed, version } = await this.queueService.needsNextSong(roomId);
          if (!needed) continue; // seeked or paused since: its new end is scheduled
          const advanced = await this.queueService.playNext(roomId, null, version);
          if (!advanced) continue;
          this.server.to(roomId).emit(SOCKET_EVENTS.PLAYBACK_STATE, advanced.state);
          this.broadcastQueue(roomId, advanced.queue);
        } catch (error: unknown) {
          // Nothing queued (or the room is gone): the song simply ends here.
          await this.playbackService.unscheduleEnd(roomId);
          if (!isExpected(error)) this.logger.warn(`Auto-advance in ${roomId} failed: ${String(error)}`);
        }
      }
    } catch (error: unknown) {
      this.logger.warn(`Auto-advance round failed: ${String(error)}`);
    } finally {
      this.advancing = false;
    }
  }

  /** Distinct people connected to the room right now. */
  private async listenerCount(roomId: string): Promise<number> {
    const sockets = await this.server.in(roomId).fetchSockets();
    return new Set(sockets.map((s) => s.data.user.id)).size;
  }

  private broadcastQueue(roomId: string, queue: QueueItem[]): void {
    this.server.to(roomId).emit(SOCKET_EVENTS.QUEUE_UPDATED, { roomId, queue });
  }
}

/** Errors that just mean "nothing to advance to": an empty queue, a room that's gone. */
function isExpected(error: unknown): boolean {
  const code = (error as { getResponse?: () => { error?: { code?: string } } }).getResponse?.()?.error?.code;
  return code === ERROR_CODES.QUEUE_EMPTY || code === ERROR_CODES.ROOM_NOT_FOUND || code === ERROR_CODES.ROOM_CLOSED;
}
