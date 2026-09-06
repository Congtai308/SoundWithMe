import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { RedisService } from "../../database/redis/redis.service";

@Controller()
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongoConnection: Connection,
    private readonly redisService: RedisService,
  ) {}

  /** Liveness: is the process itself up? Does not check dependencies. */
  @Get("health")
  health() {
    return { success: true, data: { status: "ok" } };
  }

  /** Readiness: are Mongo and Redis actually reachable right now? */
  @Get("ready")
  async ready() {
    const checks = {
      mongodb: this.mongoConnection.readyState === 1,
      redis: await this.pingRedis(),
    };

    const allHealthy = Object.values(checks).every(Boolean);

    if (!allHealthy) {
      throw new ServiceUnavailableException({
        success: false,
        error: { code: "NOT_READY", message: "One or more dependencies are unavailable" },
        checks,
      });
    }

    return { success: true, data: { status: "ok", checks } };
  }

  private async pingRedis(): Promise<boolean> {
    try {
      const pong = await this.redisService.getClient().ping();
      return pong === "PONG";
    } catch {
      return false;
    }
  }
}
