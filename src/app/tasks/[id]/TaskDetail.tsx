"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/Badge";
import AttachmentUploader from "@/components/AttachmentUploader";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  TYPE_LABELS,
  TYPE_COLORS,
} from "@/lib/labels";
import {
  updateTaskFields,
  assignTask,
  updateTaskStatus,
  approveTask,
  rejectTask,
  reopenTask,
  closeTask,
  deleteTask,
  publishTask,
  addComment,
} from "@/app/tasks/actions";
import type { getVisibleTask, listActiveUsers, listAllAppAreas } from "@/lib/tasks";
import type { SessionPayload } from "@/lib/jwt";
import type { Priority, TaskType, Status } from "@prisma/client";

type Task = NonNullable<Awaited<ReturnType<typeof getVisibleTask>>>;
type ActiveUser = Awaited<ReturnType<typeof listActiveUsers>>[number];
type AppAreaOption = Awaited<ReturnType<typeof listAllAppAreas>>[number];

const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];
const TYPES = Object.keys(TYPE_LABELS) as TaskType[];
const STATUSES = Object.keys(STATUS_LABELS) as Status[];

function formatDate(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function isOverdue(task: Task): boolean {
  return !!task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < new Date();
}

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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [approveNote, setApproveNote] = useState("");

  const canEditFields = session.role === "ADMIN" || task.createdById === session.sub;
  const isAssigneeOrAdmin = session.role === "ADMIN" || task.assigneeId === session.sub;
  const isApproverOrAdmin = session.role === "APPROVER" || session.role === "ADMIN";
  const isAdmin = session.role === "ADMIN";
  const isCreator = task.createdById === session.sub;
  const isAssignee = task.assigneeId === session.sub;
  // Reopen/Close/Delete: available to the task's own creator or assignee,
  // as well as APPROVER/ADMIN (who already have review authority over
  // every task regardless of ownership).
  const isOwnerOrReviewer = isApproverOrAdmin || isCreator || isAssignee;

  // Which statuses the plain dropdown may jump to from here. ADMIN has
  // full authority over every task -- not bound by the step-by-step
  // pipeline, so every status is open to them. Everyone else mirrors the
  // server-side FORWARD_TRANSITIONS + role checks in actions.ts exactly:
  // IN_REVIEW's and APPROVED's own exits are ADMIN-only, so non-admins get
  // nothing from those two states here (empty set, falls through below) --
  // STAGING_REVIEW's exits (approve/reject) stay their own dedicated flow
  // since they carry a note; DONE is only reachable here via Close (its
  // own button) for non-admins.
  const enabledNextStatuses = isAdmin
    ? new Set<Status>(STATUSES)
    : new Set<Status>(
        task.status === "OPEN" && isAssigneeOrAdmin
          ? ["IN_PROGRESS"]
          : task.status === "IN_PROGRESS" && isAssigneeOrAdmin
            ? ["IN_REVIEW"]
            : [],
      );

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleStatusSelect(next: Status) {
    if (next === task.status || !enabledNextStatuses.has(next)) return;
    run(() => updateTaskStatus(task.id, next));
  }

  function handleClose() {
    if (!window.confirm("Close this task and mark it Done? This skips any remaining review steps.")) return;
    run(() => closeTask(task.id));
  }

  function handleDelete() {
    if (!window.confirm("Delete this task permanently? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteTask(task.id);
        router.push("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed.");
      }
    });
  }

  async function handleFieldSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateTaskFields(task.id, formData);
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  async function handleComment(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addComment(task.id, formData);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Comment failed.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {task.isDraft && (
        <div className="flex items-center justify-between bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm">
          <span>Draft -- only visible to you.</span>
          {isCreator && isAdmin && (
            <button
              disabled={isPending}
              onClick={() => run(() => publishTask(task.id))}
              className="axiMed underline"
            >
              Publish
            </button>
          )}
        </div>
      )}

      {/* Fields */}
      {editing ? (
        <form action={handleFieldSave} className="flex flex-col gap-3">
          <input
            name="title"
            defaultValue={task.title}
            required
            className="border border-neutral-300 rounded-lg px-3 py-2 text-lg axiBold outline-none focus:border-brand"
          />
          <textarea
            name="description"
            defaultValue={task.description}
            required
            rows={4}
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select name="appAreaId" defaultValue={task.appAreaId} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">
              {appAreas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select name="type" defaultValue={task.type} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">
              {TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
            <select name="priority" defaultValue={task.priority} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
              ))}
            </select>
            <input
              type="date"
              name="dueDate"
              defaultValue={formatDate(task.dueDate)}
              className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-1">
              <label htmlFor="commits" className="text-sm axiMed text-neutral-700">
                Commits (only visible to you -- one per line, e.g. &quot;repo: hash -- what it did&quot;)
              </label>
              <textarea
                id="commits"
                name="commits"
                defaultValue={task.commits ?? ""}
                rows={3}
                placeholder={"carwash_node_backend: d0036c51 -- fixed the rounding bug"}
                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-brand"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="axiMed bg-brand text-white rounded-lg px-4 py-1.5 text-sm">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-neutral-500">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <h1 className="axiBold text-xl text-neutral-900">
              <span className="text-neutral-400 font-normal">#{task.number}</span> {task.title}
            </h1>
            {canEditFields && (
              <button onClick={() => setEditing(true)} className="text-sm text-neutral-400 hover:text-neutral-700 shrink-0">
                Edit
              </button>
            )}
          </div>
          <p className="text-sm text-neutral-600 whitespace-pre-wrap">{task.description}</p>
          <div className="flex flex-wrap gap-2">
            <Badge label={task.appArea.name} className="bg-neutral-100 text-neutral-600" />
            <Badge label={TYPE_LABELS[task.type]} className={TYPE_COLORS[task.type]} />
            <Badge label={PRIORITY_LABELS[task.priority]} className={PRIORITY_COLORS[task.priority]} />
            <Badge label={STATUS_LABELS[task.status]} className={STATUS_COLORS[task.status]} />
            {task.foundInProduction && <Badge label="Found in prod" className="bg-red-100 text-red-700" />}
            {isOverdue(task) && <Badge label="Overdue" className="bg-red-600 text-white" />}
            {task.dueDate && (
              <span className="text-xs text-neutral-400 self-center">Due {formatDate(task.dueDate)}</span>
            )}
          </div>
          {task.commits && (
            <div className="flex flex-col gap-1">
              <span className="text-xs axiMed text-neutral-400 uppercase tracking-wide">
                Commits
              </span>
              <pre className="text-xs font-mono text-neutral-700 whitespace-pre-wrap bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                {task.commits}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Assignee */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-neutral-500">Assignee:</span>
        {isAdmin ? (
          <select
            value={task.assigneeId ?? ""}
            disabled={isPending}
            onChange={(e) => run(() => assignTask(task.id, e.target.value || null))}
            className="border border-neutral-300 rounded-lg px-2 py-1 text-sm"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        ) : (
          <span className="axiMed">{task.assignee?.name ?? "Unassigned"}</span>
        )}
        <span className="text-neutral-300">·</span>
        <span className="text-neutral-500">Created by {task.createdBy.name}</span>
      </div>

      {/* Photo gallery */}
      {task.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {task.attachments.map((a) => (
            <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- src is an
                  authenticated API route that 307s to a fresh presigned S3 URL each
                  request; next/image can't proxy/optimize a redirecting, auth-gated
                  source like this. */}
              <img
                src={`/api/attachments/${a.id}`}
                alt={a.filename}
                className="w-24 h-24 object-cover rounded-lg border border-neutral-200"
              />
            </a>
          ))}
        </div>
      )}

      {/* Status transitions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
        <label className="text-sm text-neutral-500" htmlFor="statusSelect">
          Status:
        </label>
        <select
          id="statusSelect"
          value={task.status}
          disabled={isPending}
          onChange={(e) => handleStatusSelect(e.target.value as Status)}
          className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s} disabled={s !== task.status && !enabledNextStatuses.has(s)}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        {isOwnerOrReviewer && task.status !== "DONE" && (
          <button
            disabled={isPending}
            onClick={handleClose}
            className="axiMed text-sm border border-neutral-300 rounded-lg px-3 py-1.5 hover:border-brand transition-colors"
          >
            Close
          </button>
        )}
        {isOwnerOrReviewer && task.status === "DONE" && (
          <button disabled={isPending} onClick={() => run(() => reopenTask(task.id))} className="axiMed text-sm border border-neutral-300 rounded-lg px-3 py-1.5">
            Reopen
          </button>
        )}
        {isOwnerOrReviewer && (
          <button
            disabled={isPending}
            onClick={handleDelete}
            className="axiMed text-sm text-red-600 hover:text-red-700 ml-auto"
          >
            Delete
          </button>
        )}

        {task.status === "STAGING_REVIEW" && isApproverOrAdmin && !showRejectBox && (
          <>
            <input
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              placeholder="Optional note"
              className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[140px]"
            />
            <button disabled={isPending} onClick={() => run(() => approveTask(task.id, approveNote))} className="axiMed text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5">
              Approve
            </button>
            <button disabled={isPending} onClick={() => setShowRejectBox(true)} className="axiMed text-sm border border-red-300 text-red-600 rounded-lg px-3 py-1.5">
              Reject
            </button>
          </>
        )}
        {task.status === "STAGING_REVIEW" && isApproverOrAdmin && showRejectBox && (
          <div className="flex flex-col gap-2 w-full">
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Note required -- what needs fixing?"
              required
              rows={2}
              className="border border-red-300 rounded-lg px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                disabled={isPending || !rejectNote.trim()}
                onClick={() => run(() => rejectTask(task.id, rejectNote))}
                className="axiMed text-sm bg-red-600 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                Confirm Reject
              </button>
              <button onClick={() => setShowRejectBox(false)} className="text-sm text-neutral-500">
                Cancel
              </button>
            </div>
          </div>
        )}
        {task.reviewNote && (
          <p className="text-xs text-neutral-500 w-full">Last review note: {task.reviewNote}</p>
        )}
      </div>

      {/* Comment thread */}
      <div className="flex flex-col gap-4 border-t border-neutral-100 pt-4">
        <h2 className="axiBold text-sm text-neutral-700">Comments</h2>
        {task.comments.length === 0 && (
          <p className="text-sm text-neutral-400">No comments yet.</p>
        )}
        {task.comments.map((c) => (
          <div
            key={c.id}
            className={`flex flex-col gap-1.5 rounded-lg px-3 py-2 ${
              c.isPrivate ? "bg-amber-50 border border-amber-200" : c.isSystem ? "bg-neutral-50" : "bg-neutral-50"
            }`}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="axiMed text-neutral-700">{c.author.name}</span>
              <span className="text-neutral-400">
                {new Date(c.createdAt).toLocaleString()}
              </span>
              {c.isPrivate && <Badge label="Private note" className="bg-amber-200 text-amber-800" />}
            </div>
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{c.body}</p>
            {c.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {c.attachments.map((a) => (
                  <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- see note above */}
                    <img
                      src={`/api/attachments/${a.id}`}
                      alt={a.filename}
                      className="w-20 h-20 object-cover rounded-lg border border-neutral-200"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}

        <form action={handleComment} className="flex flex-col gap-2">
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Add a comment..."
            className="border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <AttachmentUploader />
          {isAdmin && (
            <label className="flex items-center gap-2 text-xs text-neutral-500">
              <input type="checkbox" name="isPrivate" />
              Private note (only visible to you)
            </label>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="axiMed text-sm bg-brand text-white rounded-lg px-4 py-1.5 w-fit disabled:opacity-50"
          >
            Comment
          </button>
        </form>
      </div>
    </div>
  );
}
