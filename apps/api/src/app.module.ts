import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { appConfig } from "./config/app.config";
import { MongodbModule } from "./database/mongodb/mongodb.module";
import { RedisModule } from "./database/redis/redis.module";
import { HealthModule } from "./common/health/health.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { UsersModule } from "./modules/users/users.module";
import { AuthModule } from "./modules/auth/auth.module";
import { MusicModule } from "./modules/music/music.module";
import { RtcModule } from "./modules/rtc/rtc.module";
import { ListeningModule } from "./modules/listening/listening.module";
import { RoomsModule } from "./modules/rooms/rooms.module";
import { PlaybackModule } from "./modules/playback/playback.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { ChatModule } from "./modules/chat/chat.module";
import { QueueModule } from "./modules/queue/queue.module";
import { AppEventsModule } from "./common/events/app-events.service";
import { MailModule } from "./modules/mail/mail.service";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { PresenceModule } from "./modules/presence/presence.module";
import { FriendsModule } from "./modules/friends/friends.module";
import { LibraryModule } from "./modules/library/library.module";
import path from "path";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      // Resolve .env relative to this compiled file's own location (dist/),
      // not the process's current working directory — otherwise running
      // `node dist/main.js` from a different folder silently fails to load
      // env vars (this bit us once already).
      envFilePath: path.resolve(__dirname, "..", ".env"),
    }),
    // Baseline rate limiting; per-endpoint overrides applied via @Throttle()
    // as real endpoints are added (Master Prompt §56).
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    MongodbModule,
    RedisModule,
    AppEventsModule,
    MailModule,
    HealthModule,
    UsersModule,
    AuthModule,
    MusicModule,
    ListeningModule,
    RoomsModule,
    PlaybackModule,
    QueueModule,
    ChatModule,
    RtcModule,
    NotificationsModule,
    PresenceModule,
    FriendsModule,
    LibraryModule,
    RealtimeModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
