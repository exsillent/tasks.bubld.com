import "server-only";
import { prisma } from "./db";

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MINUTES = 10;

/**
 * Sliding-window login rate limit, backed by the LoginAttempt table --
 * no external service needed at this scale. Locks out further attempts
 * for an email once it has 5+ failures within the last 10 minutes.
 */
export async function isRateLimited(email: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  const recentFailures = await prisma.loginAttempt.count({
    where: {
      email: email.toLowerCase(),
      success: false,
      createdAt: { gte: windowStart },
    },
  });
  return recentFailures >= MAX_FAILED_ATTEMPTS;
}

export async function recordLoginAttempt(
  email: string,
  success: boolean,
  userId?: string,
): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      email: email.toLowerCase(),
      success,
      userId: userId ?? null,
    },
  });
}
