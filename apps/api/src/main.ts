import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { RedisIoAdapter } from "./realtime/adapters/redis-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Never leak internal errors to clients in production (Master Prompt §60).
    logger: ["error", "warn", "log"],
  });

  app.setGlobalPrefix("api/v1");

  // Wired now so multi-instance scaling later is a config change, not a
  // code change (Architecture Review §5 / §16).
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties from client payloads
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

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
