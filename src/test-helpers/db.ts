import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import type { Role } from "@prisma/client";

/** Wipes all tables between tests, in FK-safe order. */
export async function resetDb() {
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestUser(overrides: {
  name?: string;
  email?: string;
  role?: Role;
  isActive?: boolean;
  password?: string;
}) {
  const password = overrides.password ?? "test-password-123";
  return prisma.user.create({
    data: {
      name: overrides.name ?? "Test User",
      email: overrides.email ?? `test-${Math.random().toString(36).slice(2)}@example.com`,
      role: overrides.role ?? "ADMIN",
      isActive: overrides.isActive ?? true,
      passwordHash: await hashPassword(password),
    },
  });
}
