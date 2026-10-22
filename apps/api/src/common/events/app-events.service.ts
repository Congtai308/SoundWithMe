import { Global, Injectable, Logger, Module } from "@nestjs/common";
import { EventEmitter } from "events";
import type { AppNotification, DirectMessage, PlaybackState, QueueItem, Room, RoomCloseReason } from "@soundwithme/types";

/**
 * Domain events services raise and the realtime gateways turn into socket
 * messages. Services stay free of Socket.IO; gateways stay free of business
 * rules. Delivery is in-process: each API instance broadcasts through the
 * Redis adapter, so one emit reaches sockets on every instance.
 */
export interface AppEventMap {
  /** A room ended. Its sockets get ROOM_CLOSED; its Redis state is dropped. */
  "room.closed": { roomId: string; reason: RoomCloseReason };
  /** Settings, roles or mutes changed: everyone in the room gets the new room (no invite code). */
  "room.updated": { room: Room };
  /** The host removed someone: their sockets are told and leave the room. */
  "room.kicked": { roomId: string; userId: string };
  /** A new song started in a room (track change, skip, queue advance). */
  "room.trackChanged": { roomId: string; trackId: string };
  /** Something for one user's bell. */
  "user.notification": { userId: string; notification: AppNotification };
  /** One user's friends list or presence view changed: they should refetch. */
  "user.friendsChanged": { userIds: string[] };
  /** A direct message was sent: both people's open tabs get it. */
  "user.directMessage": { message: DirectMessage };
  /** `readerId` read everything `otherId` sent them in a conversation. */
  "user.messagesRead": { conversationId: string; readerId: string; otherId: string; readAt: string };
  /** A member left on their own (REST): their sockets leave the room too. */
  "room.left": { roomId: string; userId: string };
  /** Someone is joining a lobby room: LobbyService freshens it up. */
  "room.lobbyJoined": { roomId: string };
  /** LobbyService topped up a lobby room's queue and/or started its next song: everyone in it is told. */
  "room.lobbyRefreshed": { roomId: string; state: PlaybackState | null; queue: QueueItem[] };
  /** Someone changed their name or avatar: their open sockets and rooms show the new one. */
  "user.profileChanged": { userId: string; displayName: string; avatarUrl: string | null };
  /** Logins were revoked: one session (`sessionId`) or all of the user's (null). Their sockets disconnect. */
  "auth.sessionsEnded": { userId: string; sessionId: string | null };
}

type Listener<K extends keyof AppEventMap> = (payload: AppEventMap[K]) => void | Promise<void>;

@Injectable()
export class AppEventsService {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(AppEventsService.name);

  constructor() {
    // Every gateway subscribes once per event; nothing grows per request.
    this.emitter.setMaxListeners(50);
  }

  emit<K extends keyof AppEventMap>(event: K, payload: AppEventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  /** Listener errors are logged, never thrown back into the service that emitted. */
  on<K extends keyof AppEventMap>(event: K, listener: Listener<K>): void {
    this.emitter.on(event, (payload: AppEventMap[K]) => {
      try {
        const result = listener(payload);
        if (result instanceof Promise) result.catch((error: unknown) => this.report(event, error));
      } catch (error: unknown) {
        this.report(event, error);
      }
    });
  }

  private report(event: string, error: unknown): void {
    this.logger.warn(`Listener for ${event} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

@Global()
@Module({
  providers: [AppEventsService],
  exports: [AppEventsService],
})
export class AppEventsModule {}
