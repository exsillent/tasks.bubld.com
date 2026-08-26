"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, requireRole } from "@/lib/auth";
import { getVisibleTask } from "@/lib/tasks";
import { notifyByEmail } from "@/lib/notify";
import { createUploadUrl, verifyUploadedObject } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import type { Priority, TaskType, Stage, StageStatus, Prisma } from "@prisma/client";

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

/** Archives the current open build as shipped history. ADMIN only. */
export async function shipCurrentBuild(): Promise<void> {
  await requireRole("ADMIN");
  const open = await prisma.build.findFirst({ where: { shippedAt: null } });
  if (!open) throw new Error("There's no open build to ship.");
  const taskCount = await prisma.task.count({ where: { buildId: open.id } });
  if (taskCount === 0) throw new Error("The next build has no tasks in it yet.");

  await prisma.build.update({ where: { id: open.id }, data: { shippedAt: new Date() } });
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
// Stage / status -- replaces the old linear pipeline (2026-08-17). Both axes
// are free-form: any logged-in user can set either, on any task, to any
// value, at any time -- no forced sequence, no approval gate. Each change
// still posts a system comment so the history stays visible.
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<Stage, string> = {
  DEVELOPMENT: "Development",
  STAGING: "Staging",
  PRODUCTION: "Production",
};

const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  CHANGES_REQUESTED: "Changes Requested",
  COMPLETE: "Complete",
};

// Order Complete auto-advances through -- see setStageStatus below.
const STAGE_ORDER: Stage[] = ["DEVELOPMENT", "STAGING", "PRODUCTION"];

export async function setStage(taskId: string, stage: Stage): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (task.stage === stage) return;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { stage } });
    await tx.comment.create({
      data: {
        taskId,
        authorId: session.sub,
        isSystem: true,
        body: `${session.name} moved this to ${STAGE_LABELS[stage]}.`,
      },
    });
    await logActivity(tx, {
      actorId: session.sub,
      action: "stage_changed",
      taskId: task.id,
      taskNumber: task.number,
      taskTitle: task.title,
      taskCreatedById: task.createdById,
      taskAssigneeId: task.assigneeId,
      field: "stage",
      oldValue: STAGE_LABELS[task.stage],
      newValue: STAGE_LABELS[stage],
    });
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

export async function setStageStatus(taskId: string, stageStatus: StageStatus): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (task.stageStatus === stageStatus) return;

  // Marking Complete auto-advances to the next stage and resets status to
  // Open there -- except from Production, which has nowhere further to go
  // (Complete just stays Complete). This is a convenience default, not a
  // gate: stage/stageStatus can still be set directly to anything, same as
  // always -- see the comment above setStage/setStageStatus.
  const currentIndex = STAGE_ORDER.indexOf(task.stage);
  const advanceStage = stageStatus === "COMPLETE" && currentIndex < STAGE_ORDER.length - 1;
  const nextStage = advanceStage ? STAGE_ORDER[currentIndex + 1] : task.stage;
  const finalStageStatus = advanceStage ? "OPEN" : stageStatus;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { stage: nextStage, stageStatus: finalStageStatus },
    });

    const commentBody = advanceStage
      ? `${session.name} marked ${STAGE_LABELS[task.stage]} complete -- moved to ${STAGE_LABELS[nextStage]}.`
      : `${session.name} set status to ${STAGE_STATUS_LABELS[stageStatus]}.`;

    await tx.comment.create({
      data: { taskId, authorId: session.sub, isSystem: true, body: commentBody },
    });

    await logActivity(tx, {
      actorId: session.sub,
      action: "stage_status_changed",
      taskId: task.id,
      taskNumber: task.number,
      taskTitle: task.title,
      taskCreatedById: task.createdById,
      taskAssigneeId: task.assigneeId,
      field: "stageStatus",
      oldValue: STAGE_STATUS_LABELS[task.stageStatus],
      newValue: STAGE_STATUS_LABELS[stageStatus],
    });

    if (advanceStage) {
      await logActivity(tx, {
        actorId: session.sub,
        action: "stage_changed",
        taskId: task.id,
        taskNumber: task.number,
        taskTitle: task.title,
        taskCreatedById: task.createdById,
        taskAssigneeId: task.assigneeId,
        field: "stage",
        oldValue: STAGE_LABELS[task.stage],
        newValue: STAGE_LABELS[nextStage],
      });
    }
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Close / Reopen -- manual, any logged-in user, from any stage/status at
// any time (2026-08-17: closing is decoupled from stage/status entirely --
// reaching Production/Complete does not auto-close a task).
// ---------------------------------------------------------------------------

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

export async function reopenTask(taskId: string): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (!task.closed) {
    throw new Error("Task is not closed.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { closed: false, closedAt: null } });
    await tx.comment.create({
      data: {
        taskId,
        authorId: session.sub,
        isSystem: true,
        body: `Reopened by ${session.name}.`,
      },
    });
    await logActivity(tx, {
      actorId: session.sub,
      action: "reopened",
      taskId: task.id,
      taskNumber: task.number,
      taskTitle: task.title,
      taskCreatedById: task.createdById,
      taskAssigneeId: task.assigneeId,
    });
  });

  await notifyTaskEvent(
    taskId,
    session.sub,
    `Task reopened: ${task.title}`,
    `${session.name} reopened "${task.title}".`,
  );

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

export async function closeTask(taskId: string): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (task.closed) {
    throw new Error("Task is already closed.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { closed: true, closedAt: new Date() },
    });
    await tx.comment.create({
      data: {
        taskId,
        authorId: session.sub,
        isSystem: true,
        body: `Closed by ${session.name}.`,
      },
    });
    await logActivity(tx, {
      actorId: session.sub,
      action: "closed",
      taskId: task.id,
      taskNumber: task.number,
      taskTitle: task.title,
      taskCreatedById: task.createdById,
      taskAssigneeId: task.assigneeId,
    });
  });

  await notifyTaskEvent(
    taskId,
    session.sub,
    `Task closed: ${task.title}`,
    `${session.name} closed "${task.title}".`,
  );

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
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
