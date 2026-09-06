import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "./redis.service";
import { REDIS_CLIENT } from "./redis.constants";

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const Redis = (await import("ioredis")).default;
        return new Redis(config.get<string>("app.redisUrl")!, {
          // Reasonable defaults; revisit if reconnect behavior under load
          // needs tuning once real traffic patterns are observed.
          maxRetriesPerRequest: 3,
        });
      },
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
