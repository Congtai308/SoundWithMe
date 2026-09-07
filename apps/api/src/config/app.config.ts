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
  jwtAccessSecret: requireEnv("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresInDays: Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? 30),
  google: {
    // Required (not optional) even in dev: Google login is one of the
    // three explicitly-requested auth methods, not an optional extra.
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ??
      "http://localhost:4000/api/v1/auth/google/callback",
  },
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
