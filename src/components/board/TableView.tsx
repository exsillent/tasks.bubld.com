"use client";

import Link from "next/link";
import {
  PIPELINE_LABELS,
  PIPELINE_MARKER,
  PIPELINE_ORDER,
  PRIORITY_LABELS,
} from "@/lib/labels";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import type { BoardTask, Me } from "./BoardView";

function isOverdue(t: BoardTask): boolean {
  return !!t.dueDate && !t.archived && new Date(t.dueDate) < new Date();
}

export default function TableView({
  tasks,
  openBuildNumber,
}: {
  tasks: BoardTask[];
  me: Me;
  runAction: (fn: () => Promise<unknown>, msg?: string) => void;
  isPending: boolean;
  openBuildNumber: number | null;
}) {
  const sorted = [...tasks].sort((a, b) => {
    const ai = PIPELINE_ORDER.indexOf(a.pipeline);
    const bi = PIPELINE_ORDER.indexOf(b.pipeline);
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    if (ai !== bi) return ai - bi;
    return b.number - a.number;
  });

  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-surface-2 text-left text-xs uppercase tracking-wide text-fg-subtle">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Task</th>
            <th className="px-3 py-2 font-medium">Area</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Stage</th>
            <th className="px-3 py-2 font-medium">Assignee</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.id} className="border-t border-border hover:bg-surface-2/50">
              <td className="px-3 py-2 tabular-nums text-fg-subtle">{t.number}</td>
              <td className="px-3 py-2">
                <Link href={`/tasks/${t.id}`} className="font-medium text-fg hover:text-brand-ink">
                  {t.title}
                </Link>
                <span className="ml-2 inline-flex gap-1 align-middle">
                  {t.archived && <Badge tone="neutral">archived</Badge>}
                  {t.changesRequested && <Badge tone="danger">changes requested</Badge>}
                  {t.foundInProduction && <Badge tone="danger">in prod</Badge>}
                  {isOverdue(t) && <Badge tone="danger">overdue</Badge>}
                  {t.build && !t.build.shippedAt && openBuildNumber != null && (
                    <Badge tone="info">build #{openBuildNumber}</Badge>
                  )}
                </span>
              </td>
              <td className="px-3 py-2 text-fg-muted">{t.appArea.name}</td>
              <td className="px-3 py-2 text-fg-muted">{PRIORITY_LABELS[t.priority]}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: PIPELINE_MARKER[t.pipeline] }} />
                  {PIPELINE_LABELS[t.pipeline]}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-fg-muted">
                  <Avatar name={t.assignee?.name} size={18} />
                  {t.assignee?.name ?? "Unassigned"}
                </span>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-fg-subtle">
                No tasks match.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
