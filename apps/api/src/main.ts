import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { RedisIoAdapter } from "./realtime/adapters/redis-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Never leak internal errors to clients in production (Master Prompt §60).
    logger: ["error", "warn", "log", "debug", "verbose"],
  });

  app.setGlobalPrefix("api/v1");

  // Wired now so multi-instance scaling later is a config change, not a
  // code change (Architecture Review §5 / §16).
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  app.use(cookieParser());

  // NOTE: no global class-validator ValidationPipe here. This project uses
  // Zod (per Master Prompt §46) via a per-route ZodValidationPipe instead —
  // see common/pipes/zod-validation.pipe.ts. A global `whitelist: true`
  // class-validator pipe would silently strip every field from a
  // Zod-typed (decorator-less) DTO down to `{}`, which is a real bug this
  // setup deliberately avoids rather than papering over.

  app.enableCors({
    origin: process.env.WEB_APP_URL ?? "http://localhost:3000",
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[api] listening on port ${port}`);
}

bootstrap();
