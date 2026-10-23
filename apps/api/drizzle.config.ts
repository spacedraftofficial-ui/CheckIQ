import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile("../../.env");
} catch {
  // No repository-level .env file; fall back to the process environment.
}

/**
 * Drizzle Kit configuration.
 *
 * Migrations are generated as reviewable SQL under `drizzle/` and applied with
 * `npm run db:migrate`. `db push` is never used in any environment — schema
 * changes always go through a committed migration file.
 */
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "mysql://checkiq:checkiq_dev_pw@127.0.0.1:3306/checkiq",
  },
  strict: true,
  verbose: true,
});
