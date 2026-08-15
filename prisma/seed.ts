import { PrismaClient, type Role } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

type SeedUser = {
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
};

// Real team accounts. Run this once per environment (local/staging/prod),
// by hand -- there is no self-serve signup route in this app.
const USERS: SeedUser[] = [
  { name: "Yasir", email: "yasir.parvez@gmail.com", role: "ADMIN", isActive: true },
  { name: "Roland", email: "tayme@msn.com", role: "APPROVER", isActive: true },
  { name: "Danielle", email: "daniellebdib@msn.com", role: "APPROVER", isActive: true },
  // Shared Techaliance contractor account -- kept disabled until Yasir
  // explicitly enables it (toggle User.isActive to true when ready).
  { name: "Techaliance", email: "shahzadatta@gmail.com", role: "CONTRACTOR", isActive: false },
];

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12-char random password
}

async function main() {
  console.log("Seeding users...\n");
  const credentials: { email: string; password: string }[] = [];

  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`- ${u.email} already exists, skipping.`);
      continue;
    }

    const password = generateTempPassword();
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        passwordHash,
      },
    });

    credentials.push({ email: u.email, password });
  }

  if (credentials.length === 0) {
    console.log("\nNo new accounts created.");
    return;
  }

  console.log("\nCreated accounts -- relay each password over an already-secure");
  console.log("channel (1Password/Slack DM), then discard this output:\n");
  for (const c of credentials) {
    console.log(`  ${c.email}  ->  ${c.password}`);
  }
  console.log(
    "\nNote: the Techaliance account (shahzadatta@gmail.com) is created disabled " +
      "(isActive=false) per request -- flip it in the database when ready to use it.",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
