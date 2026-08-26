"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { createSession } from "@/lib/auth";
import { isRateLimited, recordLoginAttempt } from "@/lib/rate-limit";

export type LoginState = { error: string } | null;

// nginx sits in front of this app and sets x-forwarded-for -- takes the
// first (client) hop if there's a chain, falls back to x-real-ip.
async function getClientIp(): Promise<string | undefined> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? undefined;
}

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

  const ipAddress = await getClientIp();
  const user = await prisma.user.findUnique({ where: { email } });

  // Always compare against something, even for a non-existent user, so
  // response timing doesn't leak whether an email exists in the system.
  const passwordHash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const valid = await verifyPassword(password, passwordHash);

  if (!user || !valid) {
    await recordLoginAttempt(email, false, user?.id, ipAddress);
    return { error: "Invalid email or password." };
  }

  if (!user.isActive) {
    await recordLoginAttempt(email, false, user.id, ipAddress);
    return { error: "This account is currently disabled." };
  }

  await recordLoginAttempt(email, true, user.id, ipAddress);
  await createSession({
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });

  // Without this, Next's client-side Router Cache can serve the PREVIOUS
  // session's cached render of "/" (or any other page) after a same-tab
  // login as a different user -- the cache doesn't know the session cookie
  // just changed. Invalidating the whole layout forces every page fresh
  // for the new session, not just "/".
  revalidatePath("/", "layout");
  redirect("/");
}
