"use client";

import Link from "next/link";
import { describeActivity } from "@/lib/activityLabels";

type FeedEntry = {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  taskId: string | null;
  taskNumber: number;
  taskTitle: string;
  createdAt: Date;
  actor: { name: string };
};

// Every date/time on this page is shown in Eastern, regardless of the
// viewer's own device timezone -- the whole team is Eastern-based, so a
// browser-local time would be actively misleading (or just inconsistent
// between viewers) rather than helpful.
const EASTERN_TZ = "America/New_York";

// en-CA gives YYYY-MM-DD, a directly comparable key -- used only to
// determine "is this the same Eastern calendar day," not for display.
function easternDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EASTERN_TZ }).format(date);
}

function dayLabel(date: Date): string {
  const now = new Date();
  const todayKey = easternDateKey(now);
  const yesterdayKey = easternDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const key = easternDateKey(date);

  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    timeZone: EASTERN_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// One row per task per day -- entries arrive newest-first, so the first
// entry seen for a given task within a day is already its most recent one.
function latestPerTask(entries: FeedEntry[]): FeedEntry[] {
  const seen = new Set<string>();
  const result: FeedEntry[] = [];
  for (const entry of entries) {
    const key = entry.taskId ?? `deleted-${entry.taskNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function groupByDay(entries: FeedEntry[]): { label: string; entries: FeedEntry[] }[] {
  const groups: { label: string; entries: FeedEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(new Date(entry.createdAt));
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.entries.push(entry);
    } else {
      groups.push({ label, entries: [entry] });
    }
  }
  return groups.map((group) => ({ ...group, entries: latestPerTask(group.entries) }));
}

export default function ActivityFeed({ entries }: { entries: FeedEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-fg-subtle">Nothing here yet.</p>;
  }

  const groups = groupByDay(entries);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label}>
          <h2 className="mb-1.5 text-sm font-medium text-fg-subtle">{group.label}</h2>
          <ul className="flex flex-col divide-y divide-border">
            {group.entries.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-2 py-2.5 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-fg-subtle">
                  {new Date(entry.createdAt).toLocaleTimeString("en-US", {
                    timeZone: EASTERN_TZ,
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-medium text-fg">{entry.actor.name}</span>
                {entry.taskId && entry.action !== "deleted" ? (
                  <Link href={`/tasks/${entry.taskId}`} className="text-fg-muted hover:underline">
                    {describeActivity(entry)}
                  </Link>
                ) : (
                  <span className="text-fg-muted">{describeActivity(entry)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
