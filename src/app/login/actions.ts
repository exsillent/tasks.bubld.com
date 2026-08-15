"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { createSession } from "@/lib/auth";
import { isRateLimited, recordLoginAttempt } from "@/lib/rate-limit";

export type LoginState = { error: string } | null;

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  if (await isRateLimited(email)) {
    return {
      error: "Too many failed attempts. Try again in a few minutes.",
    };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Always compare against something, even for a non-existent user, so
  // response timing doesn't leak whether an email exists in the system.
  const passwordHash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const valid = await verifyPassword(password, passwordHash);

  if (!user || !valid) {
    await recordLoginAttempt(email, false, user?.id);
    return { error: "Invalid email or password." };
  }

  if (!user.isActive) {
    await recordLoginAttempt(email, false, user.id);
    return { error: "This account is currently disabled." };
  }

  await recordLoginAttempt(email, true, user.id);
  await createSession({
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });

  redirect("/");
}
