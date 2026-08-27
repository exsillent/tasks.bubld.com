"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import AttachmentUploader from "@/components/AttachmentUploader";
import {
  PIPELINE_ORDER,
  PIPELINE_LABELS,
  PIPELINE_MARKER,
  PIPELINE_HINTS,
  PRIORITY_LABELS,
  TYPE_LABELS,
} from "@/lib/labels";
import {
  updateTaskFields,
  updateTaskQuote,
  toggleNextBuild,
  assignTask,
  setPipeline,
  startTask,
  sendForReview,
  approveTask,
  sendBack,
  markDeployed,
  archiveTask,
  unarchiveTask,
  deleteTask,
  publishTask,
  addComment,
} from "@/app/tasks/actions";
import type { getVisibleTask, listActiveUsers, listAllAppAreas } from "@/lib/tasks";
import type { SessionPayload } from "@/lib/jwt";
import type { Priority, TaskType } from "@prisma/client";

type Task = NonNullable<Awaited<ReturnType<typeof getVisibleTask>>>;
type ActiveUser = Awaited<ReturnType<typeof listActiveUsers>>[number];
type AppAreaOption = Awaited<ReturnType<typeof listAllAppAreas>>[number];

const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];
const TYPES = Object.keys(TYPE_LABELS) as TaskType[];

function formatDate(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}
function isOverdue(task: Task): boolean {
  return !!task.dueDate && !task.archived && new Date(task.dueDate) < new Date();
}

const field =
  "rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand";

export default function TaskDetail({
  task,
  users,
  appAreas,
  session,
}: {
  task: Task;
  users: ActiveUser[];
  appAreas: AppAreaOption[];
  session: SessionPayload;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [approveNoteOpen, setApproveNoteOpen] = useState(false);

  const isAdmin = session.role === "ADMIN";
  const isReviewer = session.role === "ADMIN" || session.role === "APPROVER";
  const isCreator = task.createdById === session.sub;
  const isAssignee = task.assigneeId === session.sub;
  const canEditFields = isAdmin || isCreator;
  const canDelete = isReviewer || isCreator || isAssignee;
  const isBuildArea = task.appArea.releaseMode === "BUILD";
  const inOpenBuild = !!task.build && !task.build.shippedAt;

  function run(fn: () => Promise<unknown>, msg?: string) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
        if (msg) toast(msg, "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Something went wrong.", "danger");
      }
    });
  }

  async function handleDelete() {
    if (
      !(await confirm({
        title: "Delete this task?",
        body: "This is permanent and removes its comments and attachments.",
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return;
    startTransition(async () => {
      try {
        await deleteTask(task.id);
        router.push("/");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Delete failed.", "danger");
      }
    });
  }

  function submitFields(formData: FormData) {
    startTransition(async () => {
      try {
        await updateTaskFields(task.id, formData);
        setEditing(false);
        router.refresh();
        toast("Saved.", "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Save failed.", "danger");
      }
    });
  }
  function submitQuote(formData: FormData) {
    run(() => updateTaskQuote(task.id, formData), "Quote saved.");
  }
  function submitComment(formData: FormData) {
    startTransition(async () => {
      try {
        await addComment(task.id, formData);
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Comment failed.", "danger");
      }
    });
  }
  function submitSendBack(formData: FormData) {
    const comment = String(formData.get("comment") ?? "");
    startTransition(async () => {
      try {
        await sendBack(task.id, comment);
        setSendBackOpen(false);
        router.refresh();
        toast("Sent back for changes.", "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed.", "danger");
      }
    });
  }
  function submitApprove(formData: FormData) {
    const note = String(formData.get("note") ?? "");
    startTransition(async () => {
      try {
        await approveTask(task.id, note);
        setApproveNoteOpen(false);
        router.refresh();
        toast("Approved.", "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed.", "danger");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {dialog}

      {task.isDraft && (
        <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-fg px-3 py-2 text-sm text-bg">
          <span>Draft — only you can see this.</span>
          {isCreator && isAdmin && (
            <button className="font-medium underline" disabled={isPending} onClick={() => run(() => publishTask(task.id), "Published.")}>
              Publish
            </button>
          )}
        </div>
      )}

      {/* Title + fields */}
      {editing ? (
        <form action={submitFields} className="flex flex-col gap-3">
          <input name="title" defaultValue={task.title} required className={`${field} text-lg font-bold`} />
          <textarea name="description" defaultValue={task.description} required rows={4} className={`${field} text-sm`} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select name="appAreaId" defaultValue={task.appAreaId} className={field}>
              {appAreas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select name="type" defaultValue={task.type} className={field}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
            <select name="priority" defaultValue={task.priority} className={field}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
            <input type="date" name="dueDate" defaultValue={formatDate(task.dueDate)} className={field} />
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-1">
              <label htmlFor="commits" className="text-sm font-medium text-fg-muted">
                Commits (only you see this — one per line)
              </label>
              <textarea id="commits" name="commits" defaultValue={task.commits ?? ""} rows={3}
                placeholder="carwash_node_backend: d0036c51 -- fixed the rounding bug"
                className={`${field} font-mono text-xs`} />
            </div>
          )}
          {isAdmin && (
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm font-medium text-fg-muted">
                <input type="checkbox" name="autoReviewed" defaultChecked={task.autoReviewed} />
                Flagged for your review (only you see this)
              </label>
              <textarea name="autoReviewNote" defaultValue={task.autoReviewNote ?? ""} rows={3}
                placeholder="What did you check, and what did you find?" className={`${field} text-sm`} />
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={isPending}>Save</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold text-fg">
              <span className="font-normal text-fg-subtle">#{task.number}</span> {task.title}
            </h1>
            {canEditFields && (
              <button onClick={() => setEditing(true)} className="shrink-0 text-sm text-fg-subtle hover:text-fg">
                Edit
              </button>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm text-fg-muted">{task.description}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{task.appArea.name}</Badge>
            <Badge tone={task.type === "ERROR" ? "danger" : task.type === "IDEA" ? "purple" : "brand"}>
              {TYPE_LABELS[task.type]}
            </Badge>
            <Badge tone={task.priority === "CRITICAL" ? "danger" : task.priority === "HIGH" ? "warning" : "info"}>
              {PRIORITY_LABELS[task.priority]}
            </Badge>
            {task.foundInProduction && <Badge tone="danger">Found in prod</Badge>}
            {isOverdue(task) && <Badge tone="danger">Overdue</Badge>}
            {task.dueDate && <span className="text-xs text-fg-subtle">Due {formatDate(task.dueDate)}</span>}
          </div>
          {task.commits && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Commits</span>
              <pre className="whitespace-pre-wrap rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-fg-muted">
                {task.commits}
              </pre>
            </div>
          )}
          {isAdmin && task.autoReviewNote && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Review note (only you)</span>
              <p className="whitespace-pre-wrap rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                {task.autoReviewNote}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pipeline stepper */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg-muted">Stage</span>
          {task.changesRequested && <Badge tone="danger">changes requested</Badge>}
          {task.archived && <Badge tone="neutral">archived</Badge>}
        </div>
        <div className="flex gap-1">
          {PIPELINE_ORDER.map((p) => {
            const active = task.pipeline === p;
            return (
              <button
                key={p}
                disabled={isPending || active}
                onClick={() => run(() => setPipeline(task.id, p), `Moved to ${PIPELINE_LABELS[p]}.`)}
                title={PIPELINE_HINTS[p]}
                className={`flex-1 rounded-[var(--radius-sm)] border px-2 py-1.5 text-[0.75rem] font-medium transition-colors ${
                  active
                    ? "border-transparent text-white"
                    : "border-border-strong bg-surface text-fg-muted hover:border-brand"
                }`}
                style={active ? { background: PIPELINE_MARKER[p] } : undefined}
              >
                {PIPELINE_LABELS[p]}
              </button>
            );
          })}
        </div>

        {/* Guided actions */}
        <div className="mt-1 flex flex-wrap gap-2">
          {!task.archived && task.pipeline === "BACKLOG" && (
            <Button size="sm" variant="primary" disabled={isPending} onClick={() => run(() => startTask(task.id), "Started.")}>
              Start
            </Button>
          )}
          {!task.archived && task.pipeline === "IN_PROGRESS" && (
            <Button size="sm" variant="primary" disabled={isPending} onClick={() => run(() => sendForReview(task.id), "Sent for review.")}>
              Send for review
            </Button>
          )}
          {!task.archived && task.pipeline === "IN_REVIEW" && isReviewer && (
            <>
              <Button size="sm" variant="primary" disabled={isPending} onClick={() => setApproveNoteOpen((v) => !v)}>
                Approve
              </Button>
              <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setSendBackOpen((v) => !v)}>
                Send back
              </Button>
            </>
          )}
          {!task.archived && task.pipeline === "READY_TO_DEPLOY" && !isBuildArea && (
            <Button size="sm" variant="primary" disabled={isPending} onClick={() => run(() => markDeployed(task.id), "Marked deployed.")}>
              Mark deployed to production
            </Button>
          )}
          {!task.archived && task.pipeline === "READY_TO_DEPLOY" && isBuildArea && !inOpenBuild && (
            <Button size="sm" variant="primary" disabled={isPending} onClick={() => run(() => toggleNextBuild(task.id, true), "Added to the next build.")}>
              Add to next build
            </Button>
          )}
          {!task.archived && task.pipeline === "DEPLOYED" && (
            <Button size="sm" variant="secondary" disabled={isPending} onClick={() => run(() => archiveTask(task.id), "Archived.")}>
              Archive
            </Button>
          )}
          {task.archived ? (
            <Button size="sm" variant="secondary" disabled={isPending} onClick={() => run(() => unarchiveTask(task.id), "Brought back.")}>
              Bring back from archive
            </Button>
          ) : (
            task.pipeline !== "DEPLOYED" && (
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => archiveTask(task.id), "Archived.")}>
                Archive
              </Button>
            )
          )}
          {canDelete && (
            <Button size="sm" variant="danger" disabled={isPending} onClick={handleDelete} className="ml-auto">
              Delete
            </Button>
          )}
        </div>

        {approveNoteOpen && task.pipeline === "IN_REVIEW" && (
          <form action={submitApprove} className="mt-1 flex flex-col gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 p-3">
            <textarea name="note" rows={2} placeholder="Optional note for the team…" className={`${field} text-sm`} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="primary" disabled={isPending}>Approve &amp; hand to Yasir</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setApproveNoteOpen(false)}>Cancel</Button>
            </div>
          </form>
        )}
        {sendBackOpen && task.pipeline === "IN_REVIEW" && (
          <form action={submitSendBack} className="mt-1 flex flex-col gap-2 rounded-[var(--radius-sm)] border border-danger/30 bg-danger-wash p-3">
            <textarea name="comment" rows={3} required placeholder="What needs changing?" className={`${field} text-sm`} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="primary" disabled={isPending} className="bg-danger hover:bg-danger-ink">
                Send back to {task.assignee?.name ?? "the assignee"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSendBackOpen(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </div>

      {/* People + build + quote */}
      <div className="flex flex-col gap-2.5 border-t border-border pt-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-fg-subtle">Assignee</span>
          {isAdmin ? (
            <select
              value={task.assigneeId ?? ""}
              disabled={isPending}
              onChange={(e) => run(() => assignTask(task.id, e.target.value || null), "Reassigned.")}
              className={field}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Avatar name={task.assignee?.name} size={18} />
              {task.assignee?.name ?? "Unassigned"}
            </span>
          )}
          <span className="text-border-strong">·</span>
          <span className="text-fg-subtle">Created by {task.createdBy.name}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-fg-subtle">Build</span>
          {task.build ? (
            <>
              <span className="font-medium">
                {task.build.shippedAt ? `Shipped in build #${task.build.number}` : `In next build (#${task.build.number})`}
              </span>
              {canEditFields && !task.build.shippedAt && (
                <button className="text-xs text-fg-subtle hover:text-fg" disabled={isPending}
                  onClick={() => run(() => toggleNextBuild(task.id, false), "Removed from build.")}>
                  remove
                </button>
              )}
            </>
          ) : canEditFields && isBuildArea ? (
            <button className="text-xs text-fg-subtle hover:text-fg" disabled={isPending}
              onClick={() => run(() => toggleNextBuild(task.id, true), "Added to the next build.")}>
              + add to next build
            </button>
          ) : (
            <span className="text-fg-subtle">—</span>
          )}
        </div>

        {(task.quotedHours != null || task.approvedBy || isReviewer) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-fg-subtle">Quoted</span>
            {isReviewer ? (
              <form action={submitQuote} className="flex flex-wrap items-center gap-2">
                <input type="number" step="0.25" min="0" name="quotedHours" defaultValue={task.quotedHours ?? ""}
                  placeholder="hrs" className={`${field} w-20`} />
                <span className="text-fg-subtle">hrs · approved by</span>
                <input type="text" name="approvedBy" defaultValue={task.approvedBy ?? ""} placeholder="name" className={`${field} w-28`} />
                <Button type="submit" size="sm" variant="ghost" disabled={isPending}>Save</Button>
              </form>
            ) : (
              <span className="font-medium">
                {task.quotedHours != null ? `${task.quotedHours} hrs` : "—"}
                {task.approvedBy ? ` · approved by ${task.approvedBy}` : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Attachments */}
      {task.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {task.attachments.map((a) => (
            <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/attachments/${a.id}`} alt={a.filename}
                className="size-24 rounded-[var(--radius-sm)] border border-border object-cover" />
            </a>
          ))}
        </div>
      )}

      {/* Comments */}
      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <h2 className="text-sm font-bold text-fg-muted">Comments</h2>
        {task.comments.length === 0 && <p className="text-sm text-fg-subtle">No comments yet.</p>}
        {task.comments.map((c) => (
          <div key={c.id} className={`flex flex-col gap-1.5 rounded-[var(--radius-sm)] px-3 py-2 ${
            c.isPrivate ? "border border-warning/30 bg-warning-wash" : "bg-surface-2"
          }`}>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-fg">{c.author.name}</span>
              <span className="text-fg-subtle">
                {new Date(c.createdAt).toLocaleString("en-US", { timeZone: "America/New_York" })}
              </span>
              {c.isPrivate && <Badge tone="warning">Private note</Badge>}
              {c.isSystem && <Badge tone="neutral">system</Badge>}
            </div>
            <p className="whitespace-pre-wrap text-sm text-fg-muted">{c.body}</p>
            {c.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {c.attachments.map((a) => (
                  <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/attachments/${a.id}`} alt={a.filename}
                      className="size-20 rounded-[var(--radius-sm)] border border-border object-cover" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}

        <form action={submitComment} className="flex flex-col gap-2">
          <textarea name="body" required rows={3} placeholder="Add a comment…" className={`${field} text-sm`} />
          <AttachmentUploader />
          {isAdmin && (
            <label className="flex items-center gap-2 text-xs text-fg-subtle">
              <input type="checkbox" name="isPrivate" />
              Private note (only you see it)
            </label>
          )}
          <Button type="submit" size="sm" variant="primary" disabled={isPending} className="w-fit">
            Comment
          </Button>
        </form>
      </div>
    </div>
  );
}
