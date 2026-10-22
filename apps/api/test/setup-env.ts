/**
 * Runs before every test file. Integration suites boot the real AppModule;
 * point it at a throwaway database so tests never touch dev data. ConfigModule
 * does not override variables that are already set, so these win over .env.
 */
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? "mongodb://localhost:27017/soundwithme_test";
process.env.REDIS_URL ??= "redis://localhost:6379";

// Required at boot. CI has no apps/api/.env, and tests shouldn't use the real ones anyway.
process.env.JWT_ACCESS_SECRET ??= "test-access-secret";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";

// Never send real mail from a test run, whatever .env holds (suites capture
// mail through the harness; without credentials MailService only logs).
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.BREVO_API_KEY = "";

// Suites expect an empty room list; the lobby rooms have a suite of their own.
process.env.LOBBY_ROOMS = "0";
