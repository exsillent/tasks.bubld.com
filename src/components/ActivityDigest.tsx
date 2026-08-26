import Link from "next/link";
import { describeActivity } from "@/lib/activityLabels";

type DigestEntry = {
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

function relativeSince(since: Date): string {
  const ms = Date.now() - since.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * "Since you were last here" -- activity on tasks the viewer created or is
 * assigned to. Only rendered when there's something to show; an empty
 * digest means nothing new happened, which isn't worth a section at all.
 */
export default function ActivityDigest({
  since,
  entries,
}: {
  since: Date;
  entries: DigestEntry[];
}) {
  if (entries.length === 0) return null;

  const DIGEST_LIMIT = 10;
  const visible = entries.slice(0, DIGEST_LIMIT);

  return (
    <div
      data-testid="activity-digest"
      className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 sm:px-5 py-4"
    >
      <h2 className="axiMed text-sm text-neutral-700 mb-3">
        Since you were last here ({relativeSince(since)})
      </h2>
      <ul className="flex flex-col gap-2">
        {visible.map((entry) => (
          <li key={entry.id} className="text-sm text-neutral-600 flex items-baseline gap-1.5">
            <span className="axiMed text-neutral-800">{entry.actor.name}</span>
            {/* A deleted task's link would just 404 -- the row is gone,
                only the snapshot in this entry survives. */}
            {entry.taskId && entry.action !== "deleted" ? (
              <Link href={`/tasks/${entry.taskId}`} className="hover:underline">
                {describeActivity(entry)}
              </Link>
            ) : (
              <span>{describeActivity(entry)}</span>
            )}
          </li>
        ))}
      </ul>
      <Link
        href="/activity"
        className="mt-3 inline-block text-sm axiMed text-brand hover:underline"
      >
        View all activity
      </Link>
    </div>
  );
}
