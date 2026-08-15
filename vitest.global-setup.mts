import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

const TEST_DB_PATH = "./test.db";

export default function globalSetup() {
  process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
  process.env.JWT_SECRET = "test-secret-not-for-production-use-only-min-16-chars";

  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` },
    stdio: "inherit",
  });

  return () => {
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  };
}
