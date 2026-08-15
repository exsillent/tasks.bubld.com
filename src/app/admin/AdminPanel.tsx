"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import Badge from "@/components/Badge";
import {
  createUser,
  setUserActive,
  setUserEmailNotifications,
  createAppArea,
  setAppAreaActive,
  type CreateUserState,
  type CreateAppAreaState,
} from "./actions";
import type { listAllUsers, listAllAppAreas } from "@/lib/tasks";
import type { Role } from "@prisma/client";

type AdminUser = Awaited<ReturnType<typeof listAllUsers>>[number];
type AdminAppArea = Awaited<ReturnType<typeof listAllAppAreas>>[number];

const ROLES: { value: Role; label: string }[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "APPROVER", label: "Approver" },
  { value: "CONTRACTOR", label: "Contractor" },
];

const inputClass =
  "border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-brand transition-colors";
const labelClass = "text-sm axiMed text-neutral-700";

export default function AdminPanel({
  users,
  appAreas,
}: {
  users: AdminUser[];
  appAreas: AdminAppArea[];
}) {
  return (
    <div className="flex flex-col gap-10">
      <UsersSection users={users} />
      <AppAreasSection appAreas={appAreas} />
    </div>
  );
}

function UsersSection({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [createState, createFormAction, createPending] = useActionState<
    CreateUserState,
    FormData
  >(createUser, null);

  function toggle(fn: () => Promise<void>) {
    setToggleError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setToggleError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="axiBold text-base text-neutral-900">Team accounts</h2>

      {toggleError && (
        <p className="text-sm text-red-600" role="alert">
          {toggleError}
        </p>
      )}

      <div className="flex flex-col divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
          >
            <div className="flex-1 min-w-[160px]">
              <p className="axiMed text-neutral-900">{u.name}</p>
              <p className="text-neutral-400 text-xs">{u.email}</p>
            </div>
            <Badge label={ROLES.find((r) => r.value === u.role)?.label ?? u.role} className="bg-neutral-100 text-neutral-600" />
            <button
              disabled={isPending}
              onClick={() => toggle(() => setUserActive(u.id, !u.isActive))}
              className={`rounded-lg px-2.5 py-1 text-xs axiMed transition-colors ${
                u.isActive
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "bg-neutral-200 text-neutral-500 hover:bg-neutral-300"
              }`}
            >
              {u.isActive ? "Active" : "Disabled"}
            </button>
            <button
              disabled={isPending}
              onClick={() =>
                toggle(() => setUserEmailNotifications(u.id, !u.emailNotificationsEnabled))
              }
              className={`rounded-lg px-2.5 py-1 text-xs axiMed transition-colors ${
                u.emailNotificationsEnabled
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : "bg-neutral-200 text-neutral-500 hover:bg-neutral-300"
              }`}
            >
              Email {u.emailNotificationsEnabled ? "on" : "off"}
            </button>
          </div>
        ))}
      </div>

      <form
        action={createFormAction}
        className="flex flex-wrap items-end gap-2 border border-neutral-200 rounded-xl px-4 py-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className={labelClass}>Name</label>
          <input id="name" name="name" required className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className={labelClass}>Email</label>
          <input id="email" name="email" type="email" required className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="role" className={labelClass}>Role</label>
          <select id="role" name="role" required defaultValue="CONTRACTOR" className={inputClass}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={createPending}
          className="axiBold bg-brand text-white rounded-lg px-4 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {createPending ? "Adding..." : "+ Add account"}
        </button>
      </form>

      {createState && "error" in createState && (
        <p className="text-sm text-red-600" role="alert">{createState.error}</p>
      )}
      {createState && "password" in createState && (
        <p className="text-sm bg-amber-50 text-amber-800 rounded-lg px-3 py-2">
          Account created. Temporary password (relay it over an already-secure
          channel, then forget it):{" "}
          <span className="axiBold font-mono">{createState.password}</span>
        </p>
      )}
    </section>
  );
}

function AppAreasSection({ appAreas }: { appAreas: AdminAppArea[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [createState, createFormAction, createPending] = useActionState<
    CreateAppAreaState,
    FormData
  >(createAppArea, null);

  function toggle(fn: () => Promise<void>) {
    setToggleError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setToggleError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="axiBold text-base text-neutral-900">App areas</h2>
      <p className="text-xs text-neutral-400 -mt-2">
        Removing one only hides it from the &quot;new task&quot; picker -- tasks that
        already used it are unaffected.
      </p>

      {toggleError && (
        <p className="text-sm text-red-600" role="alert">
          {toggleError}
        </p>
      )}

      <div className="flex flex-col divide-y divide-neutral-100 border border-neutral-200 rounded-xl overflow-hidden">
        {appAreas.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="axiMed text-neutral-900 flex-1">{a.name}</span>
            <button
              disabled={isPending}
              onClick={() => toggle(() => setAppAreaActive(a.id, !a.isActive))}
              className={`rounded-lg px-2.5 py-1 text-xs axiMed transition-colors ${
                a.isActive
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "bg-neutral-200 text-neutral-500 hover:bg-neutral-300"
              }`}
            >
              {a.isActive ? "Active" : "Disabled"}
            </button>
          </div>
        ))}
      </div>

      <form
        action={createFormAction}
        className="flex flex-wrap items-end gap-2 border border-neutral-200 rounded-xl px-4 py-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="areaName" className={labelClass}>Name</label>
          <input id="areaName" name="name" required className={inputClass} />
        </div>
        <button
          type="submit"
          disabled={createPending}
          className="axiBold bg-brand text-white rounded-lg px-4 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {createPending ? "Adding..." : "+ Add app area"}
        </button>
      </form>

      {createState?.error && (
        <p className="text-sm text-red-600" role="alert">{createState.error}</p>
      )}
    </section>
  );
}
