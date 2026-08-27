"use client";

import { useActionState } from "react";
import { createTask, type CreateTaskState } from "@/app/tasks/actions";
import AttachmentUploader from "@/components/AttachmentUploader";
import { Button } from "@/components/ui/Button";
import { PRIORITY_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { Priority, TaskType } from "@prisma/client";

const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];
const TYPES = Object.keys(TYPE_LABELS) as TaskType[];

const inputClass =
  "w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 py-2 text-sm outline-none focus:border-brand";
const labelClass = "text-sm font-medium text-fg-muted";

export default function NewTaskForm({
  users,
  appAreas,
  isAdmin,
}: {
  users: { id: string; name: string }[];
  appAreas: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState<CreateTaskState, FormData>(createTask, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Title</span>
        <input name="title" required className={inputClass} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Description</span>
        <textarea name="description" required rows={4} className={inputClass} />
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>App area</span>
          <select name="appAreaId" required className={inputClass}>
            {appAreas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Type</span>
          <select name="type" required className={inputClass}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Priority</span>
          <select name="priority" required defaultValue="MEDIUM" className={inputClass}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Due date</span>
          <input name="dueDate" type="date" className={inputClass} />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Assignee</span>
        <select name="assigneeId" className={inputClass} defaultValue="">
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input type="checkbox" name="foundWhere" value="production" />
        This is a live production bug
      </label>

      {isAdmin && (
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" name="isDraft" />
          Keep private (draft) — only you see it until published
        </label>
      )}

      <div className="flex flex-col gap-1">
        <span className={labelClass}>Photos / screenshots</span>
        <AttachmentUploader />
      </div>

      {state?.error && (
        <p className="text-sm text-danger-ink" role="alert">{state.error}</p>
      )}

      <Button type="submit" variant="primary" size="md" disabled={pending} className="w-fit px-6">
        {pending ? "Creating…" : "Create task"}
      </Button>
    </form>
  );
}
