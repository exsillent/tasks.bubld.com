"use server";

import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { hashPassword } from "@/lib/passwords";
import type { Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// Users -- ADMIN only (in practice, Yasir only)
// ---------------------------------------------------------------------------

export type CreateUserState = { error: string } | { password: string } | null;

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12-char random password
}

export async function createUser(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as Role;

  if (!name || !email || !role) {
    return { error: "Name, email, and role are all required." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "That doesn't look like a valid email address." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: { name, email, role, passwordHash },
  });

  revalidatePath("/admin");
  return { password };
}

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id: userId }, data: { isActive } });
  revalidatePath("/admin");
}

export async function setUserEmailNotifications(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await requireRole("ADMIN");
  await prisma.user.update({
    where: { id: userId },
    data: { emailNotificationsEnabled: enabled },
  });
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// App areas -- ADMIN only. Removal is a soft-disable (see schema comment on
// AppArea): existing tasks keep referencing a disabled app area normally,
// it just disappears from the "new task" picker.
// ---------------------------------------------------------------------------

export type CreateAppAreaState = { error: string } | null;

export async function createAppArea(
  _prevState: CreateAppAreaState,
  formData: FormData,
): Promise<CreateAppAreaState> {
  await requireRole("ADMIN");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Name is required." };
  }

  const existing = await prisma.appArea.findUnique({ where: { name } });
  if (existing) {
    return { error: "An app area with that name already exists." };
  }

  await prisma.appArea.create({ data: { name } });
  revalidatePath("/admin");
  return null;
}

export async function setAppAreaActive(appAreaId: string, isActive: boolean): Promise<void> {
  await requireRole("ADMIN");
  await prisma.appArea.update({ where: { id: appAreaId }, data: { isActive } });
  revalidatePath("/admin");
}
