// Dedicated E2E seed with FIXED credentials -- separate from prisma/seed.ts,
// which deliberately generates random passwords for real deployments. This
// file only ever runs against the throwaway e2e.db, never a real database,
// and is only ever executed directly (via `npx tsx e2e/seed-e2e.ts`) --
// never imported by spec files, so importing it never has the side effect
// of re-seeding. Spec files that need the fixture data import from
// ./e2e-data instead.
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import { E2E_PASSWORD, E2E_USERS } from "./e2e-data";

const url = process.env.DATABASE_URL ?? "file:./e2e.db";
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

async function main() {
  const hash = await bcrypt.hash(E2E_PASSWORD, 12);
  await prisma.user.createMany({
    data: E2E_USERS.map((user) => ({ ...user, passwordHash: hash })),
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
