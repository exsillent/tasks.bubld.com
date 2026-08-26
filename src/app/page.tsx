import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listVisibleTasks, listActiveUsers, listAllAppAreas } from "@/lib/tasks";
import { getDigestForUser, markDigestSeen } from "@/lib/activity";
import AppHeader from "@/components/AppHeader";
import TaskDashboard from "@/components/TaskDashboard";
import ActivityDigest from "@/components/ActivityDigest";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [tasks, users, appAreas, digest] = await Promise.all([
    listVisibleTasks(session),
    listActiveUsers(),
    listAllAppAreas(),
    getDigestForUser(session),
  ]);

  // This view is what "seeing" the digest means -- awaited, not
  // fire-and-forget, so the mark reliably lands before the response is
  // sent rather than racing whatever the user does next.
  await markDigestSeen(session.sub);

  return (
    <>
      <AppHeader session={session} />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-6xl w-full mx-auto">
        <ActivityDigest since={digest.since} entries={digest.entries} />
        <TaskDashboard
          tasks={tasks}
          users={users}
          appAreas={appAreas}
          currentUserId={session.sub}
          isAdmin={session.role === "ADMIN"}
        />
      </main>
    </>
  );
}
