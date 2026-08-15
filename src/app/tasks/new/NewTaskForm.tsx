"use client";

import { useActionState } from "react";
import { createTask, type CreateTaskState } from "@/app/tasks/actions";
import AttachmentUploader from "@/components/AttachmentUploader";
import { APP_AREA_LABELS, PRIORITY_LABELS, TYPE_LABELS } from "@/lib/labels";
import type { AppArea, Priority, TaskType } from "@prisma/client";

const APP_AREAS = Object.keys(APP_AREA_LABELS) as AppArea[];
const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];
const TYPES = Object.keys(TYPE_LABELS) as TaskType[];

const inputClass =
  "border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand transition-colors w-full";
const labelClass = "text-sm axiMed text-neutral-700";

export default function NewTaskForm({
  users,
  isAdmin,
}: {
  users: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState<CreateTaskState, FormData>(
    createTask,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className={labelClass}>
          Title
        </label>
        <input id="title" name="title" required className={inputClass} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={4}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="appArea" className={labelClass}>
            App area
          </label>
          <select id="appArea" name="appArea" required className={inputClass}>
            {APP_AREAS.map((a) => (
              <option key={a} value={a}>
                {APP_AREA_LABELS[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="type" className={labelClass}>
            Type
          </label>
          <select id="type" name="type" required className={inputClass}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <select id="priority" name="priority" required defaultValue="MEDIUM" className={inputClass}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="dueDate" className={labelClass}>
            Due date
          </label>
          <input id="dueDate" name="dueDate" type="date" className={inputClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="assigneeId" className={labelClass}>
          Assignee
        </label>
        <select id="assigneeId" name="assigneeId" className={inputClass} defaultValue="">
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input type="checkbox" name="foundInProduction" />
        Found in production (not caught on staging)
      </label>

      {isAdmin && (
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input type="checkbox" name="isDraft" />
          Keep private (draft) -- only visible to you until published
        </label>
      )}

      <div className="flex flex-col gap-1">
        <span className={labelClass}>Photos / screenshots</span>
        <AttachmentUploader />
      </div>

      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="axiBold bg-brand text-white rounded-lg py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed w-fit px-6"
      >
        {pending ? "Creating..." : "Create Task"}
      </button>
    </form>
  );
}
