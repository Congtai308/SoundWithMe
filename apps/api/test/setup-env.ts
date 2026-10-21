/**
 * Runs before every test file. Integration suites boot the real AppModule;
 * point it at a throwaway database so tests never touch dev data. ConfigModule
 * does not override variables that are already set, so this wins over .env.
 */
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? "mongodb://localhost:27017/soundwithme_test";
