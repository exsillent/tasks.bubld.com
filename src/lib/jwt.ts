import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET is missing or too short. Set a real random secret via env " +
        "(never commit it) before starting the app.",
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string;
  name: string;
  email: string;
  role: Role;
};

export async function signSessionToken(user: SessionPayload): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * Verifies a raw session token. Returns null on any failure (missing,
 * expired, tampered) -- callers must treat null as "not logged in," never
 * assume a truthy-but-unverified value. Pure function, no dependency on
 * next/headers, so it's usable from both middleware (Edge runtime) and
 * Server Components/Actions (Node runtime).
 */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const { sub, name, email, role } = payload as Record<string, unknown>;
    if (
      typeof sub !== "string" ||
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof role !== "string"
    ) {
      return null;
    }
    return { sub, name, email, role: role as Role };
  } catch {
    return null;
  }
}
