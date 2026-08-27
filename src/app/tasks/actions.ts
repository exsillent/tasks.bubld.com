"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, requireRole } from "@/lib/auth";
import { getVisibleTask } from "@/lib/tasks";
import { notifyByEmail } from "@/lib/notify";
import { createUploadUrl, verifyUploadedObject } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import { PIPELINE_LABELS } from "@/lib/labels";
import type { Priority, TaskType, Pipeline, Prisma } from "@prisma/client";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

type PendingAttachment = { key: string; filename: string };

/** Parses the hidden JSON field the client fills in after uploading each file to S3. */
function parseAttachments(formData: FormData): PendingAttachment[] {
  const raw = formData.get("attachments");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is PendingAttachment =>
        typeof a?.key === "string" && typeof a?.filename === "string",
    );
  } catch {
    return [];
  }
}

export async function requestUploadUrl(
  contentType: string,
): Promise<{ url: string; key: string }> {
  await requireSession();
  return createUploadUrl("task", contentType);
}

async function notifyTaskEvent(
  taskId: string,
  excludeUserId: string,
  subject: string,
  bodyText: string,
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { createdBy: true, assignee: true },
  });
  if (!task) return;

  const recipients = [task.createdBy, task.assignee]
    .filter(
      (u): u is NonNullable<typeof u> =>
        u !== null && u.id !== excludeUserId && u.emailNotificationsEnabled,
    )
    .map((u) => u.email);

  await notifyByEmail(
    recipients,
    subject,
    `${bodyText}\n\n${APP_URL}/tasks/${taskId}`,
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateTaskState = { error: string } | null;

export async function createTask(
  _prevState: CreateTaskState,
  formData: FormData,
): Promise<CreateTaskState> {
  const session = await requireSession();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const appAreaId = String(formData.get("appAreaId") ?? "");
  const priority = String(formData.get("priority") ?? "") as Priority;
  const type = String(formData.get("type") ?? "") as TaskType;
  const dueDateRaw = String(formData.get("dueDate") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;
  const foundInProduction = formData.get("foundWhere") === "production";
  // Only ADMIN's checkbox/field inputs are ever rendered in the UI, but a
  // mutating action can't trust that -- re-check the role server-side too.
  const isDraft = formData.get("isDraft") === "on" && session.role === "ADMIN";
  const commits =
    session.role === "ADMIN"
      ? String(formData.get("commits") ?? "").trim() || null
      : null;
  const autoReviewed = session.role === "ADMIN" && formData.get("autoReviewed") === "on";
  const autoReviewNote =
    session.role === "ADMIN"
      ? String(formData.get("autoReviewNote") ?? "").trim() || null
      : null;
  const canEditQuote = session.role === "ADMIN" || session.role === "APPROVER";
  const quotedHoursRaw = String(formData.get("quotedHours") ?? "").trim();
  const quotedHours = canEditQuote && quotedHoursRaw ? parseFloat(quotedHoursRaw) : null;
  const approvedBy = canEditQuote
    ? String(formData.get("approvedBy") ?? "").trim() || null
    : null;

  if (!title || !description || !appAreaId || !priority || !type) {
    return { error: "Title, description, app area, priority, and type are all required." };
  }

  const appArea = await prisma.appArea.findUnique({ where: { id: appAreaId } });
  if (!appArea) {
    return { error: "Invalid app area." };
  }

  const pendingAttachments = parseAttachments(formData);
  for (const a of pendingAttachments) {
    try {
      await verifyUploadedObject(a.key);
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Attachment upload failed." };
    }
  }

  const task = await prisma.$transaction(async (tx) => {
    const last = await tx.task.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
    const created = await tx.task.create({
      data: {
        number: (last?.number ?? 0) + 1,
        title,
        description,
        appAreaId,
        priority,
        type,
        dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
        commits,
        autoReviewed,
        autoReviewNote,
        quotedHours,
        approvedBy,
        assigneeId,
        foundInProduction,
        isDraft,
        createdById: session.sub,
        attachments: {
          create: pendingAttachments.map((a) => ({
            key: a.key,
            filename: a.filename,
            uploadedById: session.sub,
          })),
        },
      },
    });
    await logActivity(tx, {
      actorId: session.sub,
      action: "created",
      taskId: created.id,
      taskNumber: created.number,
      taskTitle: created.title,
      taskCreatedById: created.createdById,
      taskAssigneeId: created.assigneeId,
    });
    return created;
  });

  if (assigneeId && assigneeId !== session.sub && !isDraft) {
    const assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
    if (assignee && assignee.emailNotificationsEnabled) {
      await notifyByEmail(
        [assignee.email],
        `New task assigned: ${title}`,
        `${session.name} assigned you a task: "${title}"\n\n${APP_URL}/tasks/${task.id}`,
      );
    }
  }

  revalidatePath("/");
  redirect(`/tasks/${task.id}`);
}

// ---------------------------------------------------------------------------
// Field edits -- creator or ADMIN only
// ---------------------------------------------------------------------------

async function requireEditAccess(taskId: string) {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (session.role !== "ADMIN" && task.createdById !== session.sub) {
    throw new Error("Not authorized to edit this task.");
  }
  return { session, task };
}

export async function updateTaskFields(taskId: string, formData: FormData): Promise<void> {
  const { session, task } = await requireEditAccess(taskId);

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const appAreaId = String(formData.get("appAreaId") ?? "");
  const priority = String(formData.get("priority") ?? "") as Priority;
  const type = String(formData.get("type") ?? "") as TaskType;
  const dueDateRaw = String(formData.get("dueDate") ?? "");

  if (!title || !description || !appAreaId) {
    throw new Error("Title, description, and app area are required.");
  }

  const appArea = await prisma.appArea.findUnique({ where: { id: appAreaId } });
  if (!appArea) throw new Error("Invalid app area.");

  const newDueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  // Compared field-by-field (not just "something changed") so the activity
  // log records exactly what moved, not just that an edit happened.
  const fieldChanges: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  if (task.title !== title) fieldChanges.push({ field: "title", oldValue: task.title, newValue: title });
  if (task.description !== description) {
    fieldChanges.push({ field: "description", oldValue: task.description, newValue: description });
  }
  if (task.appAreaId !== appAreaId) {
    fieldChanges.push({ field: "appAreaId", oldValue: task.appAreaId, newValue: appAreaId });
  }
  if (task.priority !== priority) fieldChanges.push({ field: "priority", oldValue: task.priority, newValue: priority });
  if (task.type !== type) fieldChanges.push({ field: "type", oldValue: task.type, newValue: type });
  const oldDueDate = task.dueDate ? task.dueDate.toISOString() : null;
  const newDueDateStr = newDueDate ? newDueDate.toISOString() : null;
  if (oldDueDate !== newDueDateStr) {
    fieldChanges.push({ field: "dueDate", oldValue: oldDueDate, newValue: newDueDateStr });
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: task.id },
      data: {
        title,
        description,
        appAreaId,
        priority,
        type,
        dueDate: newDueDate,
        // Commits and the auto-review flag/note are Yasir's own, same as
        // isPrivate comments -- only ever written by ADMIN, regardless of
        // what a non-admin's form submits. Omitted entirely (not overwritten
        // with null) for anyone else, so a non-admin editing other fields can
        // never blank them out.
        ...(session.role === "ADMIN"
          ? {
              commits: String(formData.get("commits") ?? "").trim() || null,
              autoReviewed: formData.get("autoReviewed") === "on",
              autoReviewNote: String(formData.get("autoReviewNote") ?? "").trim() || null,
            }
          : {}),
      },
    });
    for (const change of fieldChanges) {
      await logActivity(tx, {
        actorId: session.sub,
        action: "edited",
        taskId: task.id,
        taskNumber: task.number,
        taskTitle: title,
        taskCreatedById: task.createdById,
        taskAssigneeId: task.assigneeId,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      });
    }
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Budget quote -- hours Techaliance quoted, and who approved that budget.
// ADMIN/APPROVER only (Roland/Danielle are APPROVER) -- Techaliance itself
// never sets its own quote as approved, same least-trust principle as every
// other write in this file.
// ---------------------------------------------------------------------------

export async function updateTaskQuote(taskId: string, formData: FormData): Promise<void> {
  const session = await requireRole("ADMIN", "APPROVER");
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");

  const quotedHoursRaw = String(formData.get("quotedHours") ?? "").trim();
  let quotedHours: number | null = null;
  if (quotedHoursRaw) {
    quotedHours = parseFloat(quotedHoursRaw);
    if (Number.isNaN(quotedHours) || quotedHours < 0) {
      throw new Error("Quoted hours must be a positive number.");
    }
  }
  const approvedBy = String(formData.get("approvedBy") ?? "").trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { quotedHours, approvedBy } });
    await logActivity(tx, {
      actorId: session.sub,
      action: "quote_updated",
      taskId: task.id,
      taskNumber: task.number,
      taskTitle: task.title,
      taskCreatedById: task.createdById,
      taskAssigneeId: task.assigneeId,
      field: "quotedHours",
      oldValue: task.quotedHours != null ? String(task.quotedHours) : null,
      newValue: quotedHours != null ? String(quotedHours) : null,
    });
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Builds -- tag tasks onto "the next build", ship it to archive as history.
// ---------------------------------------------------------------------------

/** Exactly one Build has shippedAt: null at a time -- creates it lazily. */
async function getOrCreateOpenBuild(tx: Prisma.TransactionClient) {
  const open = await tx.build.findFirst({ where: { shippedAt: null } });
  if (open) return open;
  const last = await tx.build.findFirst({ orderBy: { number: "desc" } });
  return tx.build.create({ data: { number: (last?.number ?? 0) + 1 } });
}

export async function toggleNextBuild(taskId: string, include: boolean): Promise<void> {
  const { session, task } = await requireEditAccess(taskId);

  await prisma.$transaction(async (tx) => {
    const buildId = include ? (await getOrCreateOpenBuild(tx)).id : null;
    await tx.task.update({ where: { id: task.id }, data: { buildId } });
    await logActivity(tx, {
      actorId: session.sub,
      action: include ? "build_tagged" : "build_untagged",
      taskId: task.id,
      taskNumber: task.number,
      taskTitle: task.title,
      taskCreatedById: task.createdById,
      taskAssigneeId: task.assigneeId,
    });
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

/**
 * Ships the open build: stamps shippedAt and moves every task in it to
 * DEPLOYED (that's what "the build shipped" means for the app-store apps).
 * ADMIN only.
 */
export async function shipCurrentBuild(): Promise<void> {
  const session = await requireRole("ADMIN");
  const open = await prisma.build.findFirst({ where: { shippedAt: null } });
  if (!open) throw new Error("There's no open build to ship.");
  const tasks = await prisma.task.findMany({
    where: { buildId: open.id },
    select: { id: true, number: true, title: true, createdById: true, assigneeId: true, pipeline: true },
  });
  if (tasks.length === 0) throw new Error("The next build has no tasks in it yet.");

  await prisma.$transaction(async (tx) => {
    await tx.build.update({ where: { id: open.id }, data: { shippedAt: new Date() } });
    const toDeploy = tasks.filter((t) => t.pipeline !== "DEPLOYED");
    if (toDeploy.length > 0) {
      await tx.task.updateMany({
        where: { id: { in: toDeploy.map((t) => t.id) } },
        data: { pipeline: "DEPLOYED" },
      });
      for (const t of toDeploy) {
        await logActivity(tx, {
          actorId: session.sub,
          action: "deployed",
          taskId: t.id,
          taskNumber: t.number,
          taskTitle: t.title,
          taskCreatedById: t.createdById,
          taskAssigneeId: t.assigneeId,
          field: "pipeline",
          oldValue: PIPELINE_LABELS[t.pipeline],
          newValue: PIPELINE_LABELS.DEPLOYED,
        });
      }
    }
  });
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Assignment -- ADMIN only
// ---------------------------------------------------------------------------

export async function assignTask(taskId: string, assigneeId: string | null): Promise<void> {
  const session = await requireRole("ADMIN");
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");

  const newAssignee = assigneeId ? await prisma.user.findUnique({ where: { id: assigneeId } }) : null;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { assigneeId } });
    await logActivity(tx, {
      actorId: session.sub,
      action: assigneeId ? "assigned" : "unassigned",
      taskId: task.id,
      taskNumber: task.number,
      taskTitle: task.title,
      taskCreatedById: task.createdById,
      // Snapshot the new assignee, not the old one -- that's who this
      // event is actually relevant to for the "since you were last here"
      // digest going forward.
      taskAssigneeId: assigneeId,
      field: "assigneeId",
      oldValue: task.assignee?.name ?? null,
      newValue: newAssignee?.name ?? null,
    });
  });

  if (assigneeId && !task.isDraft) {
    if (newAssignee && newAssignee.emailNotificationsEnabled) {
      await notifyByEmail(
        [newAssignee.email],
        `Task assigned to you: ${task.title}`,
        `${session.name} assigned you a task: "${task.title}"\n\n${APP_URL}/tasks/${taskId}`,
      );
    }
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Pipeline -- the single ordered track that replaced Stage x StageStatus
// (2026-08-27):
//
//   BACKLOG -> IN_PROGRESS -> IN_REVIEW -> READY_TO_DEPLOY -> DEPLOYED
//
// setPipeline is the free-form direct set any logged-in user can call (the
// board's move menu, the detail stepper -- same freedom the two old axes
// had). The named transitions below are guided wrappers that also do the
// right side effects (assign, flag, notify, system comment).
// ---------------------------------------------------------------------------

type VisibleTask = NonNullable<Awaited<ReturnType<typeof getVisibleTask>>>;

function requireOwnerOrReviewer(
  session: { role: string; sub: string },
  task: { createdById: string; assigneeId: string | null },
): void {
  const isReviewer = session.role === "ADMIN" || session.role === "APPROVER";
  const isOwner = task.createdById === session.sub || task.assigneeId === session.sub;
  if (!isReviewer && !isOwner) {
    throw new Error("Not authorized.");
  }
}

/** The account tasks land on when a reviewer approves -- "back to Yasir". */
async function primaryAdminId(tx: Prisma.TransactionClient): Promise<string | null> {
  const admin = await tx.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return admin?.id ?? null;
}

type PipelineChange = {
  pipeline?: Pipeline;
  changesRequested?: boolean;
  assigneeId?: string | null;
  archived?: boolean;
  action: "moved" | "approved" | "sent_back" | "deployed" | "archived" | "unarchived";
  systemComment?: string;
  userComment?: string;
  notify?: { subject: string; body: string };
};

async function commitPipeline(
  session: { sub: string; name: string },
  task: VisibleTask,
  change: PipelineChange,
): Promise<void> {
  const data: Prisma.TaskUpdateInput = {};
  if (change.pipeline !== undefined) data.pipeline = change.pipeline;
  if (change.changesRequested !== undefined) data.changesRequested = change.changesRequested;
  if (change.archived !== undefined) {
    data.archived = change.archived;
    data.archivedAt = change.archived ? new Date() : null;
  }
  if (change.assigneeId !== undefined) {
    data.assignee = change.assigneeId
      ? { connect: { id: change.assigneeId } }
      : { disconnect: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: task.id }, data });
    if (change.systemComment) {
      await tx.comment.create({
        data: { taskId: task.id, authorId: session.sub, isSystem: true, body: change.systemComment },
      });
    }
    if (change.userComment) {
      await tx.comment.create({
        data: { taskId: task.id, authorId: session.sub, body: change.userComment },
      });
    }
    await logActivity(tx, {
      actorId: session.sub,
      action: change.action,
      taskId: task.id,
      taskNumber: task.number,
      taskTitle: task.title,
      taskCreatedById: task.createdById,
      taskAssigneeId:
        change.assigneeId !== undefined ? change.assigneeId : task.assigneeId,
      field: change.pipeline !== undefined ? "pipeline" : undefined,
      oldValue: change.pipeline !== undefined ? PIPELINE_LABELS[task.pipeline] : undefined,
      newValue: change.pipeline !== undefined ? PIPELINE_LABELS[change.pipeline] : undefined,
    });
  });

  if (change.notify && !task.isDraft) {
    await notifyTaskEvent(task.id, session.sub, change.notify.subject, change.notify.body);
  }

  revalidatePath(`/tasks/${task.id}`);
  revalidatePath("/");
}

/** Direct set -- any logged-in user, any value. Board move menu / stepper. */
export async function setPipeline(taskId: string, pipeline: Pipeline): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (task.pipeline === pipeline) return;
  await commitPipeline(session, task, {
    pipeline,
    action: "moved",
    // Leaving IN_REVIEW clears the "changes requested" flag -- it only
    // describes a task currently sitting with a developer.
    changesRequested: pipeline === "IN_PROGRESS" ? task.changesRequested : false,
    systemComment: `${session.name} moved this to ${PIPELINE_LABELS[pipeline]}.`,
  });
}

/** BACKLOG -> IN_PROGRESS. */
export async function startTask(taskId: string): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  await commitPipeline(session, task, {
    pipeline: "IN_PROGRESS",
    action: "moved",
    systemComment: `${session.name} started this.`,
  });
}

/** -> IN_REVIEW. Clears any "changes requested" flag; pings the reviewers. */
export async function sendForReview(taskId: string): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  await commitPipeline(session, task, {
    pipeline: "IN_REVIEW",
    changesRequested: false,
    action: "moved",
    systemComment: `${session.name} sent this for review.`,
    notify: {
      subject: `Ready to review: ${task.title}`,
      body: `${session.name} sent "${task.title}" for review.`,
    },
  });
}

/**
 * Reviewer approves: task moves to READY_TO_DEPLOY and lands back on the
 * admin's plate. APPROVER or ADMIN only -- this is the one place an
 * approver is allowed to reassign a task.
 */
export async function approveTask(taskId: string, note?: string): Promise<void> {
  const session = await requireRole("ADMIN", "APPROVER");
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");

  const adminId = await prisma.$transaction((tx) => primaryAdminId(tx));
  await commitPipeline(session, task, {
    pipeline: "READY_TO_DEPLOY",
    changesRequested: false,
    assigneeId: adminId ?? task.assigneeId,
    action: "approved",
    systemComment: `${session.name} approved this. Ready to deploy.`,
    userComment: note?.trim() || undefined,
    notify: {
      subject: `Approved: ${task.title}`,
      body: `${session.name} approved "${task.title}".${note?.trim() ? `\n\n${note.trim()}` : ""}`,
    },
  });
}

/**
 * Reviewer sends a task back: to IN_PROGRESS with the "changes requested"
 * flag and a required comment. Assignee is unchanged -- it goes back to
 * whoever was working on it. APPROVER or ADMIN only.
 */
export async function sendBack(taskId: string, comment: string): Promise<void> {
  const session = await requireRole("ADMIN", "APPROVER");
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  const body = comment.trim();
  if (!body) throw new Error("Add a comment explaining what needs changing.");

  await commitPipeline(session, task, {
    pipeline: "IN_PROGRESS",
    changesRequested: true,
    action: "sent_back",
    userComment: body,
    notify: {
      subject: `Changes requested: ${task.title}`,
      body: `${session.name} sent "${task.title}" back for changes:\n\n${body}`,
    },
  });
}

/**
 * Mark a task live in production. Only for CONTINUOUS app areas -- BUILD
 * areas (Customer App, Technician App) go out in a numbered build instead,
 * so this rejects them and points at the build flow.
 */
export async function markDeployed(taskId: string): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (task.appArea.releaseMode === "BUILD") {
    throw new Error(
      `${task.appArea.name} ships in a build -- add this to the next build instead.`,
    );
  }
  await commitPipeline(session, task, {
    pipeline: "DEPLOYED",
    action: "deployed",
    systemComment: `${session.name} marked this deployed to production.`,
    notify: {
      subject: `Deployed: ${task.title}`,
      body: `${session.name} marked "${task.title}" deployed to production.`,
    },
  });
}

/** Off the board, still searchable. Replaces the old close/reopen pair. */
export async function archiveTask(taskId: string): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (task.archived) return;
  await commitPipeline(session, task, {
    archived: true,
    action: "archived",
    systemComment: `${session.name} archived this.`,
  });
}

export async function unarchiveTask(taskId: string): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (!task.archived) return;
  await commitPipeline(session, task, {
    archived: false,
    action: "unarchived",
    systemComment: `${session.name} brought this back from the archive.`,
  });
}

/** Bulk-archive every DEPLOYED task -- the "tidy up the board" button. */
export async function archiveAllDeployed(): Promise<number> {
  const session = await requireSession();
  const deployed = await prisma.task.findMany({
    where: { pipeline: "DEPLOYED", archived: false, isDraft: false },
    select: { id: true, number: true, title: true, createdById: true, assigneeId: true },
  });
  if (deployed.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.task.updateMany({
      where: { id: { in: deployed.map((t) => t.id) } },
      data: { archived: true, archivedAt: now },
    });
    for (const t of deployed) {
      await logActivity(tx, {
        actorId: session.sub,
        action: "archived",
        taskId: t.id,
        taskNumber: t.number,
        taskTitle: t.title,
        taskCreatedById: t.createdById,
        taskAssigneeId: t.assigneeId,
      });
    }
  });

  revalidatePath("/");
  return deployed.length;
}

// ---------------------------------------------------------------------------
// Delete -- creator/assignee/ADMIN only. Permanent -- cascades comments and
// attachments (DB-level onDelete: Cascade), does not touch the underlying
// S3 objects.
// ---------------------------------------------------------------------------

export async function deleteTask(taskId: string): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  requireOwnerOrReviewer(session, task);

  // Logged before the delete, in the same transaction -- ActivityLog.taskId
  // has no FK/cascade, so this entry (with its snapshotted taskNumber/
  // taskTitle) survives the task itself being gone.
  await prisma.$transaction(async (tx) => {
    await logActivity(tx, {
      actorId: session.sub,
      action: "deleted",
      taskId: task.id,
      taskNumber: task.number,
      taskTitle: task.title,
      taskCreatedById: task.createdById,
      taskAssigneeId: task.assigneeId,
    });
    await tx.task.delete({ where: { id: taskId } });
  });

  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Publish a draft -- creator only, ADMIN-only feature
// ---------------------------------------------------------------------------

export async function publishTask(taskId: string): Promise<void> {
  const session = await requireRole("ADMIN");
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.createdById !== session.sub) {
    throw new Error("Task not found.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { isDraft: false } });
    await logActivity(tx, {
      actorId: session.sub,
      action: "published",
      taskId: task.id,
      taskNumber: task.number,
      taskTitle: task.title,
      taskCreatedById: task.createdById,
      taskAssigneeId: task.assigneeId,
    });
  });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function addComment(taskId: string, formData: FormData): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Comment cannot be empty.");
  // Only ADMIN can ever post a private note -- re-checked here regardless
  // of what the client sent, same pattern as isDraft on task creation.
  const isPrivate = formData.get("isPrivate") === "on" && session.role === "ADMIN";

  const pendingAttachments = parseAttachments(formData);
  for (const a of pendingAttachments) {
    await verifyUploadedObject(a.key);
  }

  await prisma.$transaction(async (tx) => {
    await tx.comment.create({
      data: {
        taskId,
        authorId: session.sub,
        body,
        isPrivate,
        attachments: {
          create: pendingAttachments.map((a) => ({
            key: a.key,
            filename: a.filename,
            uploadedById: session.sub,
          })),
        },
      },
    });
    await logActivity(tx, {
      actorId: session.sub,
      action: "commented",
      taskId: task.id,
      taskNumber: task.number,
      taskTitle: task.title,
      taskCreatedById: task.createdById,
      taskAssigneeId: task.assigneeId,
      // Preview only, not the full body -- the activity feed links back to
      // the task for the real thing, this is just enough to scan a list.
      newValue: body.length > 140 ? `${body.slice(0, 140)}...` : body,
      isPrivate,
    });
  });

  // Private notes are Yasir's own -- never trigger a notification to
  // anyone else, since the whole point is no one else sees them.
  if (!isPrivate) {
    await notifyTaskEvent(
      taskId,
      session.sub,
      `New comment on: ${task.title}`,
      `${session.name} commented on "${task.title}":\n\n${body}`,
    );
  }

  revalidatePath(`/tasks/${taskId}`);
}
