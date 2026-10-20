import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Redis } from "ioredis";
import { RedisService } from "./redis.service";
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from "./redis.constants";

const logger = new Logger("Redis");

/** ioredis reconnects on its own; without a listener its errors bypass the app logger. */
function logConnectionErrors(connection: Redis, name: string): Redis {
  connection.on("error", (error: Error) => logger.warn(`${name}: ${error.message}`));
  return connection;
}

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const Redis = (await import("ioredis")).default;
        const client = new Redis(config.get<string>("app.redisUrl")!, {
          // Reasonable defaults; revisit if reconnect behavior under load
          // needs tuning once real traffic patterns are observed.
          maxRetriesPerRequest: 3,
        });
        return logConnectionErrors(client, "client");
      },
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [REDIS_CLIENT],
      useFactory: (client: Redis) => logConnectionErrors(client.duplicate(), "subscriber"),
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT, REDIS_SUBSCRIBER],
})
export class RedisModule {}
