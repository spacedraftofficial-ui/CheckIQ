/**
 * Test environment configuration.
 *
 * Imported first by both the setup file (workers) and the global setup file
 * (main process) so that the API always reads the test database and a
 * dedicated encryption key.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "mysql://checkiq:checkiq_dev_pw@127.0.0.1:3306/checkiq_test";
process.env.TEST_DATABASE_URL = process.env.DATABASE_URL;
process.env.JWT_ACCESS_SECRET = "test-access-secret-that-is-at-least-32-chars-long";
process.env.PII_ENCRYPTION_KEY = "dGVzdC1waWktZW5jcnlwdGlvbi1rZXktZm9yLWNoZWNpaS10ZXN0cw==";
process.env.STORAGE_DIR = "../../.local/test-storage";
process.env.EMAIL_ENABLED = "false";
process.env.LOG_LEVEL = "silent";
process.env.SEED_ADMIN_EMAIL = "admin@checkiq.test";
process.env.SEED_ADMIN_PASSWORD = "TestAdmin!2026";

// Rate limits are exercised by their own tests; they are relaxed here so that
// the rest of the suite is not throttled by repeated signups from one address.
process.env.RATE_LIMIT_MAX_REQUESTS = "100000";
process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = "1000";
process.env.SIGNUP_RATE_LIMIT_MAX_ATTEMPTS = "1000";

export {};
