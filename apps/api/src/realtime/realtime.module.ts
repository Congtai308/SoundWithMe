import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PlaybackModule } from "../modules/playback/playback.module";
import { UsersModule } from "../modules/users/users.module";
import { AuthModule } from "../modules/auth/auth.module";
import { RoomsModule } from "../modules/rooms/rooms.module";
import { QueueModule } from "../modules/queue/queue.module";
import { ChatModule } from "../modules/chat/chat.module";
import { PresenceModule } from "../modules/presence/presence.module";
import { FriendsModule } from "../modules/friends/friends.module";
import { NotificationsModule } from "../modules/notifications/notifications.module";
import { PlaybackGateway } from "./gateways/playback.gateway";
import { QueueGateway } from "./gateways/queue.gateway";
import { SocialGateway } from "./gateways/social.gateway";
import { KaraokeGateway } from "./gateways/karaoke.gateway";
import { RoomGateway } from "./gateways/room.gateway";
import { RedisModule } from "../database/redis/redis.module";
import { WsAuthService } from "./ws-auth.service";

@Module({
  // Secret is passed explicitly at verify time (WsAuthService), so no
  // module-level default is registered here.
  imports: [
    JwtModule.register({}),
    UsersModule,
    AuthModule,
    RoomsModule,
    PlaybackModule,
    QueueModule,
    ChatModule,
    RedisModule,
    PresenceModule,
    FriendsModule,
    NotificationsModule,
  ],
  providers: [PlaybackGateway, QueueGateway, SocialGateway, KaraokeGateway, RoomGateway, WsAuthService],
})
export class RealtimeModule {}
