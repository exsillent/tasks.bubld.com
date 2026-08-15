"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession, requireRole } from "@/lib/auth";
import { getVisibleTask } from "@/lib/tasks";
import { notifyByEmail } from "@/lib/notify";
import { createUploadUrl, verifyUploadedObject } from "@/lib/storage";
import type { Priority, TaskType, Status } from "@prisma/client";

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
  // Only ADMIN's checkbox input is ever rendered in the UI, but a mutating
  // action can't trust that -- re-check the role server-side too.
  const isDraft = formData.get("isDraft") === "on" && session.role === "ADMIN";

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

  const task = await prisma.task.create({
    data: {
      title,
      description,
      appAreaId,
      priority,
      type,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
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
  const { task } = await requireEditAccess(taskId);

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

  await prisma.task.update({
    where: { id: task.id },
    data: {
      title,
      description,
      appAreaId,
      priority,
      type,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
    },
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Assignment -- ADMIN only
// ---------------------------------------------------------------------------

export async function assignTask(taskId: string, assigneeId: string | null): Promise<void> {
  const session = await requireRole("ADMIN");
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");

  await prisma.task.update({ where: { id: taskId }, data: { assigneeId } });

  if (assigneeId && !task.isDraft) {
    const assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
    if (assignee && assignee.emailNotificationsEnabled) {
      await notifyByEmail(
        [assignee.email],
        `Task assigned to you: ${task.title}`,
        `${session.name} assigned you a task: "${task.title}"\n\n${APP_URL}/tasks/${taskId}`,
      );
    }
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

const FORWARD_TRANSITIONS: Record<Status, Status[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["IN_REVIEW"],
  IN_REVIEW: ["STAGING_REVIEW", "IN_PROGRESS"],
  STAGING_REVIEW: [], // only via approveTask/rejectTask below
  APPROVED: ["DONE"],
  DONE: [], // only via reopenTask below
};

export async function updateTaskStatus(taskId: string, nextStatus: Status): Promise<void> {
  const session = await requireSession();
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");

  const allowed = FORWARD_TRANSITIONS[task.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Cannot move from ${task.status} to ${nextStatus}.`);
  }

  const isAssigneeOrAdmin =
    session.role === "ADMIN" || task.assigneeId === session.sub;

  // OPEN->IN_PROGRESS and IN_PROGRESS->IN_REVIEW: the assignee doing the
  // work (or ADMIN) moves it forward.
  if (
    (task.status === "OPEN" || task.status === "IN_PROGRESS") &&
    !isAssigneeOrAdmin
  ) {
    throw new Error("Only the assignee can move this task forward.");
  }

  // IN_REVIEW -> STAGING_REVIEW or back to IN_PROGRESS: Yasir's own review
  // gate, ADMIN only.
  if (task.status === "IN_REVIEW" && session.role !== "ADMIN") {
    throw new Error("Only an admin can move a task out of review.");
  }

  // APPROVED -> DONE: marking it actually deployed, ADMIN only.
  if (task.status === "APPROVED" && session.role !== "ADMIN") {
    throw new Error("Only an admin can mark a task as deployed.");
  }

  await prisma.task.update({ where: { id: taskId }, data: { status: nextStatus } });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Approve / Reject -- APPROVER or ADMIN only, from STAGING_REVIEW
// ---------------------------------------------------------------------------

export async function approveTask(taskId: string, note: string): Promise<void> {
  const session = await requireRole("APPROVER", "ADMIN");
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (task.status !== "STAGING_REVIEW") {
    throw new Error("Only a task in staging review can be approved.");
  }

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: { status: "APPROVED", reviewNote: note || null },
    }),
    prisma.comment.create({
      data: {
        taskId,
        authorId: session.sub,
        isSystem: true,
        body: note ? `Approved by ${session.name}: ${note}` : `Approved by ${session.name}.`,
      },
    }),
  ]);

  await notifyTaskEvent(
    taskId,
    session.sub,
    `Task approved: ${task.title}`,
    `${session.name} approved "${task.title}".${note ? `\n\nNote: ${note}` : ""}`,
  );

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

export async function rejectTask(taskId: string, note: string): Promise<void> {
  const session = await requireRole("APPROVER", "ADMIN");
  if (!note.trim()) {
    throw new Error("A note is required when rejecting a task.");
  }
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (task.status !== "STAGING_REVIEW") {
    throw new Error("Only a task in staging review can be rejected.");
  }

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS", reviewNote: note },
    }),
    prisma.comment.create({
      data: {
        taskId,
        authorId: session.sub,
        isSystem: true,
        body: `Rejected by ${session.name}: ${note}`,
      },
    }),
  ]);

  await notifyTaskEvent(
    taskId,
    session.sub,
    `Task rejected: ${task.title}`,
    `${session.name} rejected "${task.title}".\n\nNote: ${note}`,
  );

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Reopen -- APPROVER or ADMIN only, from DONE
// ---------------------------------------------------------------------------

export async function reopenTask(taskId: string): Promise<void> {
  const session = await requireRole("APPROVER", "ADMIN");
  const task = await getVisibleTask(taskId, session);
  if (!task) throw new Error("Task not found.");
  if (task.status !== "DONE") {
    throw new Error("Only a done task can be reopened.");
  }

  await prisma.$transaction([
    prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } }),
    prisma.comment.create({
      data: {
        taskId,
        authorId: session.sub,
        isSystem: true,
        body: `Reopened by ${session.name}.`,
      },
    }),
  ]);

  await notifyTaskEvent(
    taskId,
    session.sub,
    `Task reopened: ${task.title}`,
    `${session.name} reopened "${task.title}".`,
  );

  revalidatePath(`/tasks/${taskId}`);
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
  await prisma.task.update({ where: { id: taskId }, data: { isDraft: false } });
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

  await prisma.comment.create({
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
