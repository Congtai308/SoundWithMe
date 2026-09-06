import { registerAs } from "@nestjs/config";

/**
 * Centralized, typed access to environment variables. Nothing in the rest
 * of the app should read `process.env` directly — see .env.example at the
 * repo root for the full variable list.
 */
export const appConfig = registerAs("app", () => ({
  port: Number(process.env.PORT ?? 4000),
  webAppUrl: process.env.WEB_APP_URL ?? "http://localhost:3000",
  mongodbUri: requireEnv("MONGODB_URI"),
  redisUrl: requireEnv("REDIS_URL"),
  jwtSecret: process.env.JWT_SECRET, // required once auth module is implemented
  r2: {
    endpoint: process.env.R2_ENDPOINT,
    accessKey: process.env.R2_ACCESS_KEY,
    secretKey: process.env.R2_SECRET_KEY,
    bucket: process.env.R2_BUCKET,
  },
  sentryDsn: process.env.SENTRY_DSN,
  postHogKey: process.env.POSTHOG_KEY,
}));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Fail fast on boot rather than surfacing a confusing error later
    // (e.g. a Mongo connection timeout with no explanation).
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
