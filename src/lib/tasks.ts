import "server-only";
import { prisma } from "./db";
import type { SessionPayload } from "./jwt";

/**
 * An EXTERNAL user (outside contractor, e.g. an SEO consultant) can only
 * ever see tasks they created or are assigned to. Every other role sees
 * the whole board. One place so the board query, the single-task fetch,
 * the activity feed and the attachment route all enforce it identically.
 */
export function seesOnlyOwnTasks(role: SessionPayload["role"]): boolean {
  return role === "EXTERNAL";
}

/**
 * Task-visibility filter, shared by every query that lists or fetches
 * tasks:
 *   - a draft task is invisible to everyone except its creator;
 *   - an EXTERNAL user only sees tasks they created or are assigned to.
 * This lives in one place so every call site enforces it the same way --
 * a server-side data-layer check, not just a UI-hidden row.
 */
export function visibleToUserWhere(userId: string, role: SessionPayload["role"]) {
  const draftRule = { OR: [{ isDraft: false }, { createdById: userId }] };
  if (!seesOnlyOwnTasks(role)) return draftRule;
  return {
    AND: [draftRule, { OR: [{ createdById: userId }, { assigneeId: userId }] }],
  };
}

const TASK_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  assignee: { select: { id: true, name: true, email: true, role: true } },
  appArea: true,
  build: { select: { number: true, shippedAt: true } },
} as const;

/**
 * Commit references and Claude's auto-review notes are Yasir's own --
 * never sent to a non-admin browser in the first place, same enforcement
 * pattern as private comments and draft tasks: redacted here at the query
 * layer, not just hidden in the UI.
 */
function redactAdminOnlyFields<
  T extends { commits: string | null; autoReviewed: boolean; autoReviewNote: string | null },
>(task: T, role: SessionPayload["role"]): T {
  return role === "ADMIN"
    ? task
    : { ...task, commits: null, autoReviewed: false, autoReviewNote: null };
}

export async function listVisibleTasks(session: SessionPayload) {
  const tasks = await prisma.task.findMany({
    where: visibleToUserWhere(session.sub, session.role),
    include: TASK_INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
  return tasks.map((t) => redactAdminOnlyFields(t, session.role));
}

/**
 * Returns null if the task doesn't exist OR the viewer isn't allowed to
 * see it -- a draft that isn't theirs, or (for an EXTERNAL user) a task
 * they neither created nor are assigned to. Every task Server Action
 * funnels through here first, so this null is also what blocks an
 * EXTERNAL user from acting on a task outside their scope.
 */
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
  if (
    seesOnlyOwnTasks(session.role) &&
    task.createdById !== session.sub &&
    task.assigneeId !== session.sub
  ) {
    return null;
  }
  return redactAdminOnlyFields(task, session.role);
}

export async function listActiveUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
}

/** ADMIN-only user management screen: every account, active or not. */
export async function listAllUsers() {
  return prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      emailNotificationsEnabled: true,
    },
    orderBy: { name: "asc" },
  });
}

/** For the "new task" picker -- only app areas currently offered. */
export async function listActiveAppAreas() {
  return prisma.appArea.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

/**
 * For the dashboard filter and admin screen -- every app area, including
 * disabled ones, so historical tasks that reference a retired app area
 * can still be filtered/found.
 */
export async function listAllAppAreas() {
  return prisma.appArea.findMany({ orderBy: { name: "asc" } });
}

/**
 * Builds for the /builds screen: the one open build first (if any), then
 * shipped ones newest first. Draft tasks are never counted here.
 */
export async function listBuilds(session: SessionPayload) {
  const builds = await prisma.build.findMany({
    orderBy: [{ shippedAt: "asc" }, { number: "desc" }],
    include: {
      tasks: {
        where: { isDraft: false },
        select: {
          id: true,
          number: true,
          title: true,
          pipeline: true,
          appArea: { select: { name: true } },
          assignee: { select: { name: true } },
        },
        orderBy: { number: "asc" },
      },
    },
  });
  // open build (shippedAt null) sorts first because null < any date in
  // SQLite's ASC ordering; everything after is shipped, newest first.
  const open = builds.find((b) => b.shippedAt === null) ?? null;
  const shipped = builds
    .filter((b) => b.shippedAt !== null)
    .sort((a, b) => b.number - a.number);
  return { open, shipped, isAdmin: session.role === "ADMIN" };
}
