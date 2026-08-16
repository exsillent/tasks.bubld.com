import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { getVisibleTask, listVisibleTasks } from "@/lib/tasks";
import { resetDb, createTestUser } from "@/test-helpers/db";
import { __clearTestCookies } from "../../../vitest.setup";
import {
  createTask,
  updateTaskFields,
  updateTaskQuote,
  toggleNextBuild,
  shipCurrentBuild,
  assignTask,
  updateTaskStatus,
  approveTask,
  rejectTask,
  reopenTask,
  closeTask,
  deleteTask,
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

    it("ADMIN can jump straight to any status, skipping the normal pipeline", async () => {
      const task = await makeTask(); // status OPEN, unassigned

      await loginAs(admin);
      await updateTaskStatus(task.id, "STAGING_REVIEW");
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        "STAGING_REVIEW",
      );

      // Also works going "backwards" -- ADMIN isn't bound by
      // FORWARD_TRANSITIONS at all, unlike every other role.
      await updateTaskStatus(task.id, "OPEN");
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        "OPEN",
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

    it("CONTRACTOR cannot reopen a task they neither created nor are assigned to", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });

      await loginAs(contractor);
      await expect(reopenTask(task.id)).rejects.toThrow("Not authorized");
    });

    it("the task's own creator can reopen it, even without a reviewer role", async () => {
      await loginAs(contractor);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });

      await loginAs(contractor);
      await reopenTask(task.id);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        "IN_PROGRESS",
      );
    });

    it("the task's own assignee can reopen it, even without a reviewer role", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await assignTask(task.id, contractor.id);
      await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });

      await loginAs(contractor);
      await reopenTask(task.id);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        "IN_PROGRESS",
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("closeTask", () => {
    it("the creator can close their own task from any status", async () => {
      await loginAs(contractor);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow(); // status OPEN

      await loginAs(contractor);
      await closeTask(task.id);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        "DONE",
      );

      const comments = await prisma.comment.findMany({ where: { taskId: task.id } });
      expect(comments.some((c) => c.isSystem && c.body.includes("Closed by"))).toBe(true);
    });

    it("the assignee can close a task even if they didn't create it", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await assignTask(task.id, contractor.id);

      await loginAs(contractor);
      await closeTask(task.id);
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
        "DONE",
      );
    });

    it("someone who is neither creator, assignee, nor reviewer cannot close a task", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(contractor);
      await expect(closeTask(task.id)).rejects.toThrow("Not authorized");
    });

    it("cannot close a task that's already Done", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });

      await loginAs(admin);
      await expect(closeTask(task.id)).rejects.toThrow("Task is already closed.");
    });
  });

  // -------------------------------------------------------------------------
  describe("deleteTask", () => {
    it("the creator can delete their own task", async () => {
      await loginAs(contractor);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(contractor);
      await deleteTask(task.id);
      expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
    });

    it("deleting a task also removes its comments", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      const fd = new FormData();
      fd.set("body", "a comment");
      await addComment(task.id, fd);

      await loginAs(admin);
      await deleteTask(task.id);
      expect(await prisma.comment.findMany({ where: { taskId: task.id } })).toHaveLength(0);
    });

    it("someone who is neither creator, assignee, nor reviewer cannot delete a task", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(contractor);
      await expect(deleteTask(task.id)).rejects.toThrow("Not authorized");
      expect(await prisma.task.findUnique({ where: { id: task.id } })).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("task numbering", () => {
    it("assigns sequential numbers in creation order", async () => {
      await loginAs(admin);
      await createTask(null, taskForm({ ...BASE_TASK_FIELDS, title: "First" })).catch(() => {});
      await createTask(null, taskForm({ ...BASE_TASK_FIELDS, title: "Second" })).catch(() => {});
      await createTask(null, taskForm({ ...BASE_TASK_FIELDS, title: "Third" })).catch(() => {});

      const tasks = await prisma.task.findMany({ orderBy: { number: "asc" } });
      expect(tasks.map((t) => [t.title, t.number])).toEqual([
        ["First", 1],
        ["Second", 2],
        ["Third", 3],
      ]);
    });
  });

  // -------------------------------------------------------------------------
  describe("commits field (Yasir-only)", () => {
    it("ADMIN can set commits, and sees them back", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await updateTaskFields(
        task.id,
        taskForm({ ...BASE_TASK_FIELDS, commits: "carwash_node_backend: d0036c51 -- fixed it" }),
      );

      const visible = await getVisibleTask(task.id, {
        sub: admin.id,
        name: admin.name,
        email: admin.email,
        role: "ADMIN",
      });
      expect(visible!.commits).toBe("carwash_node_backend: d0036c51 -- fixed it");
    });

    it("commits are redacted for a non-admin, even though they exist in the DB", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await updateTaskFields(
        task.id,
        taskForm({ ...BASE_TASK_FIELDS, commits: "secret-repo: abc123" }),
      );

      // Confirm it really is in the DB, not just untested.
      expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).commits).toBe(
        "secret-repo: abc123",
      );

      const asApprover = await getVisibleTask(task.id, {
        sub: approver.id,
        name: approver.name,
        email: approver.email,
        role: "APPROVER",
      });
      expect(asApprover!.commits).toBeNull();

      const list = await listVisibleTasks({
        sub: approver.id,
        name: approver.name,
        email: approver.email,
        role: "APPROVER",
      });
      expect(list.find((t) => t.id === task.id)!.commits).toBeNull();
    });

    it("a non-admin editing their own task cannot set commits, even by submitting the field", async () => {
      await loginAs(approver);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const ownTask = await prisma.task.findFirstOrThrow({ where: { createdById: approver.id } });

      await updateTaskFields(
        ownTask.id,
        taskForm({ ...BASE_TASK_FIELDS, title: "Edited by approver", commits: "sneaky: 999999" }),
      );

      const updated = await prisma.task.findUniqueOrThrow({ where: { id: ownTask.id } });
      expect(updated.title).toBe("Edited by approver");
      expect(updated.commits).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("auto-review flag/note (Yasir-only)", () => {
    it("ADMIN can mark a task auto-reviewed with a note, and sees it back", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await updateTaskFields(
        task.id,
        taskForm({
          ...BASE_TASK_FIELDS,
          autoReviewed: "on",
          autoReviewNote: "Checked dev_branch, commit e240583 fixes this.",
        }),
      );

      const visible = await getVisibleTask(task.id, {
        sub: admin.id,
        name: admin.name,
        email: admin.email,
        role: "ADMIN",
      });
      expect(visible!.autoReviewed).toBe(true);
      expect(visible!.autoReviewNote).toBe("Checked dev_branch, commit e240583 fixes this.");
    });

    it("auto-review is redacted for a non-admin, even though it exists in the DB", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await updateTaskFields(
        task.id,
        taskForm({ ...BASE_TASK_FIELDS, autoReviewed: "on", autoReviewNote: "internal notes" }),
      );

      expect(
        (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).autoReviewed,
      ).toBe(true);

      const asApprover = await getVisibleTask(task.id, {
        sub: approver.id,
        name: approver.name,
        email: approver.email,
        role: "APPROVER",
      });
      expect(asApprover!.autoReviewed).toBe(false);
      expect(asApprover!.autoReviewNote).toBeNull();

      const list = await listVisibleTasks({
        sub: approver.id,
        name: approver.name,
        email: approver.email,
        role: "APPROVER",
      });
      const listed = list.find((t) => t.id === task.id)!;
      expect(listed.autoReviewed).toBe(false);
      expect(listed.autoReviewNote).toBeNull();
    });

    it("a non-admin editing their own task cannot set auto-review, even by submitting the fields", async () => {
      await loginAs(approver);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const ownTask = await prisma.task.findFirstOrThrow({ where: { createdById: approver.id } });

      await updateTaskFields(
        ownTask.id,
        taskForm({
          ...BASE_TASK_FIELDS,
          title: "Edited by approver",
          autoReviewed: "on",
          autoReviewNote: "sneaky",
        }),
      );

      const updated = await prisma.task.findUniqueOrThrow({ where: { id: ownTask.id } });
      expect(updated.title).toBe("Edited by approver");
      expect(updated.autoReviewed).toBe(false);
      expect(updated.autoReviewNote).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("updateTaskQuote (budget: hours quoted, who approved it)", () => {
    it("ADMIN can set quoted hours and approver name", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      const fd = new FormData();
      fd.set("quotedHours", "2.5");
      fd.set("approvedBy", "Yasir");
      await updateTaskQuote(task.id, fd);

      const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(updated.quotedHours).toBe(2.5);
      expect(updated.approvedBy).toBe("Yasir");
    });

    it("APPROVER (Roland/Danielle) can also set it", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      await loginAs(approver);
      const fd = new FormData();
      fd.set("quotedHours", "4");
      fd.set("approvedBy", "Roland");
      await updateTaskQuote(task.id, fd);

      const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(updated.quotedHours).toBe(4);
      expect(updated.approvedBy).toBe("Roland");
    });

    it("CONTRACTOR cannot set it, even on their own task", async () => {
      await loginAs(contractor);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      const fd = new FormData();
      fd.set("quotedHours", "10");
      fd.set("approvedBy", "Techaliance");
      await expect(updateTaskQuote(task.id, fd)).rejects.toThrow();

      const unchanged = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(unchanged.quotedHours).toBeNull();
      expect(unchanged.approvedBy).toBeNull();
    });

    it("rejects a negative or non-numeric hours value", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();

      const fd = new FormData();
      fd.set("quotedHours", "-3");
      await expect(updateTaskQuote(task.id, fd)).rejects.toThrow("positive number");
    });

    it("CONTRACTOR submitting quotedHours via createTask is silently ignored", async () => {
      await loginAs(contractor);
      await createTask(
        null,
        taskForm({ ...BASE_TASK_FIELDS, quotedHours: "8", approvedBy: "Techaliance" }),
      ).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      expect(task.quotedHours).toBeNull();
      expect(task.approvedBy).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe("next build (toggleNextBuild / shipCurrentBuild)", () => {
    it("the task's creator can add it to the next build, lazily creating build #1", async () => {
      await loginAs(approver);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow({ where: { createdById: approver.id } });

      await toggleNextBuild(task.id, true);

      const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: { build: true } });
      expect(updated.build).not.toBeNull();
      expect(updated.build!.number).toBe(1);
      expect(updated.build!.shippedAt).toBeNull();
    });

    it("a second task added afterward joins the same open build", async () => {
      await loginAs(admin);
      await createTask(null, taskForm({ ...BASE_TASK_FIELDS, title: "Task A" })).catch(() => {});
      await createTask(null, taskForm({ ...BASE_TASK_FIELDS, title: "Task B" })).catch(() => {});
      const [a, b] = await prisma.task.findMany({ orderBy: { number: "asc" } });

      await toggleNextBuild(a.id, true);
      await toggleNextBuild(b.id, true);

      const [ua, ub] = await Promise.all([
        prisma.task.findUniqueOrThrow({ where: { id: a.id } }),
        prisma.task.findUniqueOrThrow({ where: { id: b.id } }),
      ]);
      expect(ua.buildId).toBe(ub.buildId);
      expect(await prisma.build.count()).toBe(1);
    });

    it("removing a task from the build clears buildId without deleting the Build row", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await toggleNextBuild(task.id, true);

      await toggleNextBuild(task.id, false);

      const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(updated.buildId).toBeNull();
      expect(await prisma.build.count()).toBe(1);
    });

    it("a non-owner, non-admin cannot toggle another user's task onto the build", async () => {
      await loginAs(approver);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow({ where: { createdById: approver.id } });

      await loginAs(contractor);
      await expect(toggleNextBuild(task.id, true)).rejects.toThrow();
    });

    it("shipCurrentBuild is ADMIN-only", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await toggleNextBuild(task.id, true);

      await loginAs(approver);
      await expect(shipCurrentBuild()).rejects.toThrow();
    });

    it("shipCurrentBuild throws if there's no open build, or the open build is empty", async () => {
      await loginAs(admin);
      await expect(shipCurrentBuild()).rejects.toThrow("no open build");

      // An open build with zero tasks (created then fully emptied out) also
      // shouldn't be shippable.
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await toggleNextBuild(task.id, true);
      await toggleNextBuild(task.id, false);
      await expect(shipCurrentBuild()).rejects.toThrow("no tasks");
    });

    it("shipping archives the build; the next task tagged starts a fresh one", async () => {
      await loginAs(admin);
      await createTask(null, taskForm(BASE_TASK_FIELDS)).catch(() => {});
      const task = await prisma.task.findFirstOrThrow();
      await toggleNextBuild(task.id, true);

      await shipCurrentBuild();

      const shipped = await prisma.build.findFirstOrThrow({ where: { number: 1 } });
      expect(shipped.shippedAt).not.toBeNull();

      await createTask(null, taskForm({ ...BASE_TASK_FIELDS, title: "Task after ship" })).catch(() => {});
      const nextTask = await prisma.task.findFirstOrThrow({ where: { title: "Task after ship" } });
      await toggleNextBuild(nextTask.id, true);

      const updated = await prisma.task.findUniqueOrThrow({ where: { id: nextTask.id }, include: { build: true } });
      expect(updated.build!.number).toBe(2);
      expect(updated.build!.shippedAt).toBeNull();

      // The originally shipped task keeps pointing at build #1 -- shipping
      // doesn't retroactively clear membership, that's the permanent record.
      const originalTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: { build: true } });
      expect(originalTask.build!.number).toBe(1);
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
