import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { appConfig } from "./config/app.config";
import { MongodbModule } from "./database/mongodb/mongodb.module";
import { RedisModule } from "./database/redis/redis.module";
import { HealthModule } from "./common/health/health.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
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
    HealthModule,
    // Feature modules (auth, users, rooms, playback, ...) are added here as
    // they are implemented — intentionally not scaffolded as empty
    // placeholders per the "no placeholder implementation" rule.
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
