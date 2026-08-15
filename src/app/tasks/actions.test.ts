import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { getVisibleTask, listVisibleTasks } from "@/lib/tasks";
import { resetDb, createTestUser } from "@/test-helpers/db";
import { __clearTestCookies } from "../../../vitest.setup";
import {
  createTask,
  updateTaskFields,
  assignTask,
  updateTaskStatus,
  approveTask,
  rejectTask,
  reopenTask,
  publishTask,
  addComment,
} from "./actions";

async function loginAs(user: { id: string; name: string; email: string; role: "ADMIN" | "CONTRACTOR" | "APPROVER" }) {
  __clearTestCookies();
  await createSession({ sub: user.id, name: user.name, email: user.email, role: user.role });
}

function taskForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const BASE_TASK_FIELDS = {
  title: "Fix the thing",
  description: "It's broken.",
  appAreaId: "customer_app",
  priority: "MEDIUM",
  type: "ERROR",
};

describe("task Server Actions", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>;
  let approver: Awaited<ReturnType<typeof createTestUser>>;
  let contractor: Awaited<ReturnType<typeof createTestUser>>;
  let otherApprover: Awaited<ReturnType<typeof createTestUser>>;

  beforeEach(async () => {
    await resetDb();
    admin = await createTestUser({ name: "Yasir", role: "ADMIN" });
    approver = await createTestUser({ name: "Roland", role: "APPROVER" });
    otherApprover = await createTestUser({ name: "Danielle", role: "APPROVER" });
    contractor = await createTestUser({ name: "Techaliance", role: "CONTRACTOR" });
  });

  // -------------------------------------------------------------------------
  describe("createTask", () => {
    it("creates a task with the required fields", async () => {
      await loginAs(admin);
      const result = await createTask(null, taskForm(BASE_TASK_FIELDS)).catch((e) => {
        // createTask redirects on success, which our mock turns into a throw.
        if (e instanceof Error && e.message.startsWith("REDIRECT:")) return null;
        throw e;
      });
      expect(result).toBeNull(); // i.e. it redirected, meaning it succeeded

      const tasks = await prisma.task.findMany();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe("Fix the thing");
      expect(tasks[0].createdById).toBe(admin.id);
    });

    it("rejects missing required fields without throwing", async () => {
      await loginAs(admin);
      const result = await createTask(null, taskForm({ title: "", description: "" }));
      expect(result?.error).toBeTruthy();
      expect(await prisma.task.count()).toBe(0);
    });

    it("only honors isDraft for ADMIN, even if a non-admin sends it", async () => {
      await loginAs(contractor);
      await createTask(
        null,
        taskForm({ ...BASE_TASK_FIELDS, isDraft: "on" }),
      ).catch((e) => {
        if (e instanceof Error && e.message.startsWith("REDIRECT:")) return null;
        throw e;
      });
      const task = await prisma.task.findFirstOrThrow();
      expect(task.isDraft).toBe(false);
    });

    it("honors isDraft when ADMIN sends it", async () => {
      await loginAs(admin);
      await createTask(null, taskForm({ ...BASE_TASK_FIELDS, isDraft: "on" })).catch((e) => {
        if (e instanceof Error && e.message.startsWith("REDIRECT:")) return null;
        throw e;
      });
      const task = await prisma.task.findFirstOrThrow();
      expect(task.isDraft).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe("draft visibility", () => {
    it("a draft task is invisible to non-creators, including by direct id", async () => {
      await loginAs(admin);
      await createTask(null, taskForm({ ...BASE_TASK_FIELDS, isDraft: "on" })).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(approver);
      expect(await getVisibleTask(task.id, {
        sub: approver.id,
        name: approver.name,
        email: approver.email,
        role: "APPROVER",
      })).toBeNull();

      const list = await listVisibleTasks({
        sub: approver.id,
        name: approver.name,
        email: approver.email,
        role: "APPROVER",
      });
      expect(list.find((t) => t.id === task.id)).toBeUndefined();
    });

    it("a draft task IS visible to its creator", async () => {
      await loginAs(admin);
      await createTask(null, taskForm({ ...BASE_TASK_FIELDS, isDraft: "on" })).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      const visible = await getVisibleTask(task.id, {
        sub: admin.id,
        name: admin.name,
        email: admin.email,
        role: "ADMIN",
      });
      expect(visible).not.toBeNull();
    });

    it("publishTask makes a draft visible to everyone", async () => {
      await loginAs(admin);
      await createTask(null, taskForm({ ...BASE_TASK_FIELDS, isDraft: "on" })).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(admin);
      await publishTask(task.id);

      await loginAs(approver);
      const visible = await getVisibleTask(task.id, {
        sub: approver.id,
        name: approver.name,
        email: approver.email,
        role: "APPROVER",
      });
      expect(visible).not.toBeNull();
      expect(visible!.isDraft).toBe(false);
    });

    it("publishTask throws for a non-creator, even if ADMIN role somehow applied", async () => {
      const secondAdmin = await createTestUser({ name: "Second Admin", role: "ADMIN" });
      await loginAs(admin);
      await createTask(null, taskForm({ ...BASE_TASK_FIELDS, isDraft: "on" })).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(secondAdmin);
      await expect(publishTask(task.id)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  describe("updateTaskFields", () => {
    it("allows the creator to edit their own task", async () => {
      await loginAs(approver);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(approver);
      await updateTaskFields(
        task.id,
        taskForm({ ...BASE_TASK_FIELDS, title: "Updated title" }),
      );
      const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(updated.title).toBe("Updated title");
    });

    it("allows ADMIN to edit any task", async () => {
      await loginAs(approver);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(admin);
      await updateTaskFields(task.id, taskForm({ ...BASE_TASK_FIELDS, title: "Admin edit" }));
      const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(updated.title).toBe("Admin edit");
    });

    it("rejects an edit from someone who is neither creator nor ADMIN", async () => {
      await loginAs(approver);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(otherApprover);
      await expect(
        updateTaskFields(task.id, taskForm({ ...BASE_TASK_FIELDS, title: "Hijacked" })),
      ).rejects.toThrow("Not authorized to edit this task.");
    });
  });

  // -------------------------------------------------------------------------
  describe("assignTask", () => {
    it("ADMIN can assign a task", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await assignTask(task.id, contractor.id);
      const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(updated.assigneeId).toBe(contractor.id);
    });

    it("non-ADMIN cannot assign a task", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(approver);
      await expect(assignTask(task.id, contractor.id)).rejects.toThrow("Not authorized");
    });
  });

  // -------------------------------------------------------------------------
  describe("updateTaskStatus transition matrix", () => {
    async function makeTask(assigneeId?: string) {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      if (assigneeId) {
        await assignTask(task.id, assigneeId);
      }
      return task;
    }

    it("assignee can move OPEN -> IN_PROGRESS", async () => {
      const task = await makeTask(contractor.id);
      await loginAs(contractor);
      await updateTaskStatus(task.id, "IN_PROGRESS");
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        "IN_PROGRESS",
      );
    });

    it("a non-assignee, non-admin cannot move OPEN -> IN_PROGRESS", async () => {
      const task = await makeTask(contractor.id);
      await loginAs(approver);
      await expect(updateTaskStatus(task.id, "IN_PROGRESS")).rejects.toThrow(
        "Only the assignee can move this task forward.",
      );
    });

    it("ADMIN can move OPEN -> IN_PROGRESS even when unassigned", async () => {
      const task = await makeTask();
      await loginAs(admin);
      await updateTaskStatus(task.id, "IN_PROGRESS");
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        "IN_PROGRESS",
      );
    });

    it("rejects an invalid/skipped transition (OPEN -> STAGING_REVIEW)", async () => {
      const task = await makeTask(contractor.id);
      await loginAs(contractor);
      await expect(updateTaskStatus(task.id, "STAGING_REVIEW")).rejects.toThrow(
        "Cannot move from OPEN to STAGING_REVIEW.",
      );
    });

    it("only ADMIN can move IN_REVIEW -> STAGING_REVIEW", async () => {
      const task = await makeTask(contractor.id);
      await loginAs(contractor);
      await updateTaskStatus(task.id, "IN_PROGRESS");
      await updateTaskStatus(task.id, "IN_REVIEW");

      // Contractor cannot push it into staging review themselves.
      await expect(updateTaskStatus(task.id, "STAGING_REVIEW")).rejects.toThrow(
        "Only an admin can move a task out of review.",
      );

      await loginAs(admin);
      await updateTaskStatus(task.id, "STAGING_REVIEW");
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        "STAGING_REVIEW",
      );
    });

    it("only ADMIN can mark APPROVED -> DONE", async () => {
      const task = await makeTask();
      await prisma.task.update({ where: { id: task.id }, data: { status: "APPROVED" } });

      await loginAs(approver);
      await expect(updateTaskStatus(task.id, "DONE")).rejects.toThrow(
        "Only an admin can mark a task as deployed.",
      );

      await loginAs(admin);
      await updateTaskStatus(task.id, "DONE");
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        "DONE",
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("approveTask / rejectTask", () => {
    async function makeStagingTask() {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await prisma.task.update({ where: { id: task.id }, data: { status: "STAGING_REVIEW" } });
      return task;
    }

    it("APPROVER can approve a task in staging review", async () => {
      const task = await makeStagingTask();
      await loginAs(approver);
      await approveTask(task.id, "Looks good");
      const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(updated.status).toBe("APPROVED");
      expect(updated.reviewNote).toBe("Looks good");

      const comments = await prisma.comment.findMany({ where: { taskId: task.id } });
      expect(comments.some((c) => c.isSystem && c.body.includes("Approved by Roland"))).toBe(
        true,
      );
    });

    it("CONTRACTOR cannot approve", async () => {
      const task = await makeStagingTask();
      await loginAs(contractor);
      await expect(approveTask(task.id, "")).rejects.toThrow("Not authorized");
    });

    it("cannot approve a task that isn't in STAGING_REVIEW", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow(); // status OPEN

      await loginAs(approver);
      await expect(approveTask(task.id, "")).rejects.toThrow(
        "Only a task in staging review can be approved.",
      );
    });

    it("rejectTask requires a non-empty note", async () => {
      const task = await makeStagingTask();
      await loginAs(approver);
      await expect(rejectTask(task.id, "   ")).rejects.toThrow(
        "A note is required when rejecting a task.",
      );
    });

    it("rejectTask sends the task back to IN_PROGRESS with the note recorded", async () => {
      const task = await makeStagingTask();
      await loginAs(otherApprover);
      await rejectTask(task.id, "The button is misaligned");
      const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(updated.status).toBe("IN_PROGRESS");
      expect(updated.reviewNote).toBe("The button is misaligned");
    });
  });

  // -------------------------------------------------------------------------
  describe("reopenTask", () => {
    it("APPROVER can reopen a DONE task", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });

      await loginAs(approver);
      await reopenTask(task.id);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        "IN_PROGRESS",
      );
    });

    it("cannot reopen a task that isn't DONE", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(admin);
      await expect(reopenTask(task.id)).rejects.toThrow("Only a done task can be reopened.");
    });

    it("CONTRACTOR cannot reopen", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });

      await loginAs(contractor);
      await expect(reopenTask(task.id)).rejects.toThrow("Not authorized");
    });
  });

  // -------------------------------------------------------------------------
  describe("addComment and private notes", () => {
    it("any authenticated user who can see the task can comment", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(contractor);
      const fd = new FormData();
      fd.set("body", "Working on it now.");
      await addComment(task.id, fd);

      const comments = await prisma.comment.findMany({ where: { taskId: task.id } });
      expect(comments).toHaveLength(1);
      expect(comments[0].authorId).toBe(contractor.id);
    });

    it("only ADMIN's isPrivate flag is honored, even if another role sends it", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(contractor);
      const fd = new FormData();
      fd.set("body", "Trying to sneak a private note");
      fd.set("isPrivate", "on");
      await addComment(task.id, fd);

      const comment = await prisma.comment.findFirstOrThrow({ where: { taskId: task.id } });
      expect(comment.isPrivate).toBe(false);
    });

    it("a private comment from ADMIN is hidden from non-admins but visible to ADMIN", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(admin);
      const fd = new FormData();
      fd.set("body", "commit abc123, see UserController.ts:42");
      fd.set("isPrivate", "on");
      await addComment(task.id, fd);

      const asApprover = await getVisibleTask(task.id, {
        sub: approver.id,
        name: approver.name,
        email: approver.email,
        role: "APPROVER",
      });
      expect(asApprover!.comments).toHaveLength(0);

      const asAdmin = await getVisibleTask(task.id, {
        sub: admin.id,
        name: admin.name,
        email: admin.email,
        role: "ADMIN",
      });
      expect(asAdmin!.comments).toHaveLength(1);
      expect(asAdmin!.comments[0].isPrivate).toBe(true);
    });

    it("rejects an empty comment", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      const fd = new FormData();
      fd.set("body", "   ");
      await expect(addComment(task.id, fd)).rejects.toThrow("Comment cannot be empty.");
    });
  });
});
