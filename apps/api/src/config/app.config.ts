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
  // Optional: only YouTube *search* needs it; link resolution uses oEmbed.
  // Several keys (comma-separated, plus YOUTUBE_API_KEY_BACKUP) are used in
  // order: when one runs out of daily quota, the next takes over.
  youtubeApiKeys: [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_BACKUP]
    .flatMap((value) => (value ?? "").split(","))
    .map((key) => key.trim())
    .filter(Boolean),
  // Outgoing mail (email verification, password reset). Gmail: host
  // smtp.gmail.com, port 465, user = the Gmail address, pass = an App
  // Password (Google Account → Security → App passwords). Hosts that block
  // SMTP (Render's free plan) send through Brevo's HTTPS API instead: set
  // BREVO_API_KEY (an "xkeysib-" API key) and MAIL_FROM, a sender verified in
  // Brevo. Without either, mails are only written to the API log, which is
  // enough for local dev.
  mail: {
    brevoApiKey: process.env.BREVO_API_KEY,
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER ?? "SoundWithMe <no-reply@localhost>",
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
