import "server-only";
import { prisma } from "./db";
import type { SessionPayload } from "./jwt";
import type { Prisma } from "@prisma/client";

export type ActivityAction =
  | "created"
  | "edited"
  | "assigned"
  | "unassigned"
  | "stage_changed"
  | "stage_status_changed"
  | "closed"
  | "reopened"
  | "deleted"
  | "published"
  | "commented"
  | "quote_updated"
  | "build_tagged"
  | "build_untagged";

type LogActivityInput = {
  actorId: string;
  action: ActivityAction;
  taskId: string;
  taskNumber: number;
  taskTitle: string;
  taskCreatedById: string;
  taskAssigneeId: string | null;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  isPrivate?: boolean;
};

/**
 * Writes one structured ActivityLog row. Always call this in the same
 * transaction as the mutation it's recording -- a client can be either
 * `prisma` directly or a `tx` inside `prisma.$transaction`.
 */
export async function logActivity(
  client: Prisma.TransactionClient | typeof prisma,
  input: LogActivityInput,
): Promise<void> {
  await client.activityLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      taskId: input.taskId,
      taskNumber: input.taskNumber,
      taskTitle: input.taskTitle,
      taskCreatedById: input.taskCreatedById,
      taskAssigneeId: input.taskAssigneeId,
      field: input.field ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      isPrivate: input.isPrivate ?? false,
    },
  });
}

const DIGEST_INCLUDE = {
  actor: { select: { id: true, name: true } },
} as const;

/**
 * "Since you were last here" -- activity on tasks the viewer created or is
 * assigned to, since their lastSeenAt. Same rule for every role, including
 * ADMIN -- no "admin sees everything" special case here, that's what the
 * full /activity feed is for. Never includes the viewer's own actions
 * (nothing to catch up on about something you did yourself).
 */
export async function getDigestForUser(session: SessionPayload) {
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { lastSeenAt: true, createdAt: true },
  });
  const since = user?.lastSeenAt ?? user?.createdAt ?? new Date(0);

  const entries = await prisma.activityLog.findMany({
    where: {
      createdAt: { gt: since },
      actorId: { not: session.sub },
      OR: [{ taskCreatedById: session.sub }, { taskAssigneeId: session.sub }],
      ...(session.role === "ADMIN" ? {} : { isPrivate: false }),
    },
    include: DIGEST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return { since, entries };
}

/** Marks the digest as viewed -- call once the viewer has actually seen it. */
export async function markDigestSeen(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
}

/**
 * Full team activity, newest first, for the browsable /activity page.
 * Not date-scoped -- once an entry has shown up here it stays visible,
 * grouped by day in the UI rather than hidden behind a day picker.
 */
export async function getAllActivity(session: SessionPayload) {
  return prisma.activityLog.findMany({
    where: {
      ...(session.role === "ADMIN" ? {} : { isPrivate: false }),
    },
    include: DIGEST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Recent successful logins -- who, when, from what IP. ADMIN-only (Yasir);
 * callers must check session.role themselves before calling this, same as
 * every other role gate in this file.
 */
export async function getRecentLogins(limit = 30) {
  return prisma.loginAttempt.findMany({
    where: { success: true },
    select: { id: true, email: true, ipAddress: true, createdAt: true, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
