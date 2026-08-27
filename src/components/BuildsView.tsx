"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { listBuilds } from "@/lib/tasks";
import { PIPELINE_LABELS, PIPELINE_MARKER } from "@/lib/labels";
import { Button } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { shipCurrentBuild, toggleNextBuild } from "@/app/tasks/actions";

type Builds = Awaited<ReturnType<typeof listBuilds>>;
type Build = Builds["shipped"][number];

function TaskRow({ t, canRemove }: { t: Build["tasks"][number]; canRemove: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <span className="size-2 shrink-0 rounded-full" style={{ background: PIPELINE_MARKER[t.pipeline] }} />
      <Link href={`/tasks/${t.id}`} className="font-medium text-fg hover:text-brand-ink">
        <span className="text-fg-subtle">#{t.number}</span> {t.title}
      </Link>
      <span className="text-xs text-fg-subtle">{t.appArea.name}</span>
      <span className="ml-auto text-xs text-fg-subtle">{PIPELINE_LABELS[t.pipeline]}</span>
      {canRemove && (
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                await toggleNextBuild(t.id, false);
                router.refresh();
                toast("Removed from the build.", "success");
              } catch (err) {
                toast(err instanceof Error ? err.message : "Failed.", "danger");
              }
            })
          }
          className="text-xs text-fg-subtle hover:text-danger-ink"
        >
          remove
        </button>
      )}
    </div>
  );
}

export default function BuildsView({ open, shipped, isAdmin }: Builds) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [isPending, startTransition] = useTransition();

  async function ship() {
    if (!open) return;
    if (
      !(await confirm({
        title: `Ship build #${open.number}?`,
        body: `Its ${open.tasks.length} task${open.tasks.length === 1 ? "" : "s"} move to Deployed and the build becomes permanent history.`,
        confirmLabel: "Ship it",
      }))
    )
      return;
    startTransition(async () => {
      try {
        await shipCurrentBuild();
        router.refresh();
        toast(`Build #${open.number} shipped.`, "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed.", "danger");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {dialog}

      <section className="rounded-[var(--radius)] border border-border">
        <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-fg">
              {open ? `Next build · #${open.number}` : "Next build"}
            </h2>
            {open && <Badge tone="info">{open.tasks.length} tasks</Badge>}
          </div>
          {isAdmin && open && open.tasks.length > 0 && (
            <Button size="sm" variant="primary" disabled={isPending} onClick={ship}>
              Ship build #{open.number}
            </Button>
          )}
        </header>
        {open && open.tasks.length > 0 ? (
          <div className="divide-y divide-border">
            {open.tasks.map((t) => (
              <TaskRow key={t.id} t={t} canRemove={isAdmin} />
            ))}
          </div>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-fg-subtle">
            No tasks queued. Add one from the &ldquo;To deploy&rdquo; column on the board.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-fg-muted">Shipped</h2>
        {shipped.length === 0 ? (
          <EmptyState title="No builds shipped yet." />
        ) : (
          shipped.map((b) => (
            <div key={b.id} className="rounded-[var(--radius)] border border-border">
              <header className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
                <span className="font-bold text-fg">Build #{b.number}</span>
                <span className="text-xs text-fg-subtle">
                  {b.shippedAt
                    ? new Date(b.shippedAt).toLocaleDateString("en-US", {
                        timeZone: "America/New_York",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : ""}
                </span>
                <Badge tone="neutral">{b.tasks.length} tasks</Badge>
              </header>
              <div className="divide-y divide-border">
                {b.tasks.map((t) => (
                  <TaskRow key={t.id} t={t} canRemove={false} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
