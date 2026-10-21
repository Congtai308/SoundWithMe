import { IoAdapter } from "@nestjs/platform-socket.io";
import type { INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ServerOptions } from "socket.io";
import type { Redis } from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from "../../database/redis/redis.constants";

/**
 * Wires the Socket.IO Redis adapter so broadcasts fan out correctly once
 * there is more than one NestJS instance (Architecture Review §5/§16).
 * At single-instance MVP this is a no-op in practice — it only starts
 * mattering once a load balancer sits in front of multiple API instances.
 * Activating it now means scaling later is a deploy config change, not a
 * code change.
 *
 * Both Redis connections are owned by RedisModule, which closes them after
 * the Socket.IO server has shut down — this adapter never closes them itself.
 *
 * Also owns Socket.IO CORS: same single allowed origin as the REST API, with
 * credentials so the browser sends the httpOnly auth cookie on the handshake.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const pubClient = this.app.get<Redis>(REDIS_CLIENT);
    const subClient = this.app.get<Redis>(REDIS_SUBSCRIBER);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const webAppUrl = this.app.get(ConfigService).get<string>("app.webAppUrl");
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: webAppUrl, credentials: true },
    });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
