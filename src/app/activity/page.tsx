import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import {
  getAllActivity,
  getRecentLogins,
  getDigestForUser,
  markDigestSeen,
} from "@/lib/activity";
import { describeActivity } from "@/lib/activityLabels";
import AppHeader from "@/components/AppHeader";
import ActivityFeed from "@/components/ActivityFeed";
import LoginHistory from "@/components/LoginHistory";

function relativeSince(since: Date): string {
  const days = Math.floor((Date.now() - since.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default async function UpdatesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.role === "ADMIN";
  const [entries, logins, digest] = await Promise.all([
    getAllActivity(session),
    isAdmin ? getRecentLogins() : Promise.resolve([]),
    getDigestForUser(session),
  ]);

  // Reading this page is what "seeing" the digest means -- awaited so the
  // mark lands before the response, not racing the next click.
  await markDigestSeen(session.sub);

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-5 text-lg font-bold text-fg">Updates</h1>

        {digest.entries.length > 0 && (
          <div className="mb-8 rounded-[var(--radius)] border border-brand/25 bg-brand-wash px-4 py-3">
            <h2 className="mb-2 text-sm font-bold text-brand-ink">
              New since your last visit ({relativeSince(digest.since)})
            </h2>
            <ul className="flex flex-col gap-1.5">
              {digest.entries.slice(0, 12).map((e) => (
                <li key={e.id} className="flex items-baseline gap-1.5 text-sm text-fg-muted">
                  <span className="font-medium text-fg">{e.actor.name}</span>
                  {e.taskId && e.action !== "deleted" ? (
                    <Link href={`/tasks/${e.taskId}`} className="hover:underline">
                      {describeActivity(e)}
                    </Link>
                  ) : (
                    <span>{describeActivity(e)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ActivityFeed entries={entries} />
        {isAdmin && <LoginHistory entries={logins} />}
      </main>
    </>
  );
}
