"use client";

import { useTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import Badge from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  createUser,
  setUserActive,
  setUserEmailNotifications,
  createAppArea,
  setAppAreaActive,
  setAppAreaReleaseMode,
  type CreateUserState,
  type CreateAppAreaState,
} from "./actions";
import type { listAllUsers, listAllAppAreas } from "@/lib/tasks";
import type { Role } from "@prisma/client";

type AdminUser = Awaited<ReturnType<typeof listAllUsers>>[number];
type AdminAppArea = Awaited<ReturnType<typeof listAllAppAreas>>[number];

const ROLES: { value: Role; label: string }[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "APPROVER", label: "Reviewer" },
  { value: "CONTRACTOR", label: "Developer" },
];

const field =
  "h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2.5 text-sm outline-none focus:border-brand";

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

function useRun() {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>, msg?: string) =>
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
        if (msg) toast(msg, "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Something went wrong.", "danger");
      }
    });
  return { run, isPending };
}

function UsersSection({ users }: { users: AdminUser[] }) {
  const { run, isPending } = useRun();
  const [createState, createFormAction, createPending] = useActionState<CreateUserState, FormData>(
    createUser,
    null,
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-fg">Team accounts</h2>

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-[160px] flex-1">
              <p className="font-medium text-fg">{u.name}</p>
              <p className="text-xs text-fg-subtle">{u.email}</p>
            </div>
            <Badge tone={u.role === "ADMIN" ? "brand" : "neutral"}>
              {ROLES.find((r) => r.value === u.role)?.label ?? u.role}
            </Badge>
            <button
              disabled={isPending}
              onClick={() => run(() => setUserActive(u.id, !u.isActive), "Updated.")}
              className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors ${
                u.isActive
                  ? "bg-success-wash text-success-ink hover:brightness-95"
                  : "bg-surface-2 text-fg-subtle hover:bg-surface-3"
              }`}
            >
              {u.isActive ? "Active" : "Disabled"}
            </button>
            <button
              disabled={isPending}
              onClick={() => run(() => setUserEmailNotifications(u.id, !u.emailNotificationsEnabled), "Updated.")}
              className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors ${
                u.emailNotificationsEnabled
                  ? "bg-info-wash text-info hover:brightness-95"
                  : "bg-surface-2 text-fg-subtle hover:bg-surface-3"
              }`}
            >
              Email {u.emailNotificationsEnabled ? "on" : "off"}
            </button>
          </div>
        ))}
      </div>

      <form action={createFormAction} className="flex flex-wrap items-end gap-2 rounded-[var(--radius)] border border-border p-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-fg-muted">
          Name
          <input name="name" required className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-fg-muted">
          Email
          <input name="email" type="email" required className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-fg-muted">
          Role
          <select name="role" required defaultValue="CONTRACTOR" className={field}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary" size="md" disabled={createPending}>
          {createPending ? "Adding…" : "Add account"}
        </Button>
      </form>

      {createState && "error" in createState && (
        <p className="text-sm text-danger-ink" role="alert">{createState.error}</p>
      )}
      {createState && "password" in createState && (
        <p className="rounded-[var(--radius-sm)] bg-warning-wash px-3 py-2 text-sm text-warning">
          Account created. Temporary password (relay it over a secure channel, then forget it):{" "}
          <span className="font-mono font-bold">{createState.password}</span>
        </p>
      )}
    </section>
  );
}

function AppAreasSection({ appAreas }: { appAreas: AdminAppArea[] }) {
  const { run, isPending } = useRun();
  const [createState, createFormAction, createPending] = useActionState<CreateAppAreaState, FormData>(
    createAppArea,
    null,
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-fg">App areas</h2>
      <p className="-mt-2 text-xs text-fg-subtle">
        Release mode decides what the &ldquo;To deploy&rdquo; column offers: continuous areas get
        &ldquo;Mark deployed&rdquo;, build areas get &ldquo;Add to next build&rdquo;. Disabling an
        area only hides it from the new-task picker.
      </p>

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border">
        {appAreas.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-[140px] flex-1 font-medium text-fg">{a.name}</span>
            <div className="flex overflow-hidden rounded-[var(--radius-sm)] border border-border-strong">
              {(["CONTINUOUS", "BUILD"] as const).map((m) => (
                <button
                  key={m}
                  disabled={isPending}
                  onClick={() => run(() => setAppAreaReleaseMode(a.id, m), "Release mode updated.")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    a.releaseMode === m ? "bg-fg text-bg" : "bg-surface text-fg-muted hover:bg-surface-2"
                  }`}
                >
                  {m === "CONTINUOUS" ? "Continuous" : "App build"}
                </button>
              ))}
            </div>
            <button
              disabled={isPending}
              onClick={() => run(() => setAppAreaActive(a.id, !a.isActive), "Updated.")}
              className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors ${
                a.isActive
                  ? "bg-success-wash text-success-ink hover:brightness-95"
                  : "bg-surface-2 text-fg-subtle hover:bg-surface-3"
              }`}
            >
              {a.isActive ? "Active" : "Disabled"}
            </button>
          </div>
        ))}
      </div>

      <form action={createFormAction} className="flex flex-wrap items-end gap-2 rounded-[var(--radius)] border border-border p-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-fg-muted">
          Name
          <input name="name" required className={field} />
        </label>
        <Button type="submit" variant="primary" size="md" disabled={createPending}>
          {createPending ? "Adding…" : "Add app area"}
        </Button>
      </form>

      {createState?.error && (
        <p className="text-sm text-danger-ink" role="alert">{createState.error}</p>
      )}
    </section>
  );
}
