import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

export default function globalSetup() {
  const dbPath = "./e2e.db";
  if (existsSync(dbPath)) unlinkSync(dbPath);

  const env = {
    ...process.env,
    DATABASE_URL: `file:${dbPath}`,
    JWT_SECRET: "e2e-test-secret-not-for-production-use-only",
  };

  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx e2e/seed-e2e.ts", { env, stdio: "inherit" });
}
