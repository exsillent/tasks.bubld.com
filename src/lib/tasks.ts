import "server-only";
import { prisma } from "./db";
import type { SessionPayload } from "./jwt";

/**
 * Draft-visibility filter, shared by every query that lists or fetches
 * tasks: a draft task is invisible to everyone except its creator. This
 * lives in one place so every call site enforces it the same way -- see
 * the plan's security section on this being a server-side data-layer
 * check, not just a UI-hidden row.
 */
export function visibleToUserWhere(userId: string) {
  return {
    OR: [{ isDraft: false }, { createdById: userId }],
  };
}

const TASK_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  assignee: { select: { id: true, name: true, email: true, role: true } },
} as const;

export async function listVisibleTasks(session: SessionPayload) {
  return prisma.task.findMany({
    where: visibleToUserWhere(session.sub),
    include: TASK_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
}

/** Returns null if the task doesn't exist OR the viewer isn't allowed to see it (draft, not theirs). */
export async function getVisibleTask(taskId: string, session: SessionPayload) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      ...TASK_INCLUDE,
      // Private comments (Yasir's own technical notes) are excluded here,
      // at the query layer, for anyone who isn't ADMIN -- never filtered
      // client-side, so there's no path where the data even reaches a
      // non-admin browser.
      comments: {
        where: session.role === "ADMIN" ? {} : { isPrivate: false },
        include: {
          author: { select: { id: true, name: true, role: true } },
          attachments: true,
        },
        orderBy: { createdAt: "asc" },
      },
      attachments: true,
    },
  });

  if (!task) return null;
  if (task.isDraft && task.createdById !== session.sub) return null;
  return task;
}

export async function listActiveUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}
