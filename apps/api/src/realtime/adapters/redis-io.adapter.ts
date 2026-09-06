import { IoAdapter } from "@nestjs/platform-socket.io";
import type { INestApplicationContext } from "@nestjs/common";
import type { ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { REDIS_CLIENT } from "../../database/redis/redis.constants";

/**
 * Wires the Socket.IO Redis adapter so broadcasts fan out correctly once
 * there is more than one NestJS instance (Architecture Review §5/§16).
 * At single-instance MVP this is a no-op in practice — it only starts
 * mattering once a load balancer sits in front of multiple API instances.
 * Activating it now means scaling later is a deploy config change, not a
 * code change.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const pubClient = this.app.get(REDIS_CLIENT);
    const subClient = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
