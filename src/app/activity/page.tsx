import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAllActivity, getRecentLogins } from "@/lib/activity";
import AppHeader from "@/components/AppHeader";
import ActivityFeed from "@/components/ActivityFeed";
import LoginHistory from "@/components/LoginHistory";

export default async function ActivityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.role === "ADMIN";
  const [entries, logins] = await Promise.all([
    getAllActivity(session),
    isAdmin ? getRecentLogins() : Promise.resolve([]),
  ]);

  return (
    <>
      <AppHeader session={session} />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-6xl w-full mx-auto">
        <h1 className="axiBold text-lg text-neutral-900 mb-5">Activity</h1>
        <ActivityFeed entries={entries} />
        {isAdmin && <LoginHistory entries={logins} />}
      </main>
    </>
  );
}
