import { UseFilters, type OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { SOCKET_EVENTS } from "@soundwithme/constants";
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
import { AppEventsService } from "../../common/events/app-events.service";
import { WsExceptionFilter } from "../ws-exception.filter";
import { RATE_LIMITS, assertJoined, consumeRateLimit } from "../socket-guards";
import type { AppServer, AppSocket } from "../realtime.types";

/** Shared room queue. Permissions are checked against the stored room in QueueService. */
@UseFilters(WsExceptionFilter)
@WebSocketGateway({ namespace: "/" })
export class QueueGateway implements OnModuleInit {
  @WebSocketServer()
  private readonly server!: AppServer;

  constructor(
    private readonly queueService: QueueService,
    private readonly events: AppEventsService,
  ) {}

  onModuleInit(): void {
    // A new song starts with a clean slate of skip votes.
    this.events.on("room.trackChanged", async ({ roomId, trackId }) => {
      await this.queueService.clearSkipVotes(roomId, trackId);
      const listeners = await this.listenerCount(roomId);
      this.server.to(roomId).emit(SOCKET_EVENTS.SKIP_STATE, await this.queueService.skipState(roomId, trackId, listeners));
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

  /** Distinct people connected to the room right now. */
  private async listenerCount(roomId: string): Promise<number> {
    const sockets = await this.server.in(roomId).fetchSockets();
    return new Set(sockets.map((s) => s.data.user.id)).size;
  }

  private broadcastQueue(roomId: string, queue: QueueItem[]): void {
    this.server.to(roomId).emit(SOCKET_EVENTS.QUEUE_UPDATED, { roomId, queue });
  }
}
