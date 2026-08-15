import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listVisibleTasks, listActiveUsers } from "@/lib/tasks";
import AppHeader from "@/components/AppHeader";
import TaskDashboard from "@/components/TaskDashboard";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [tasks, users] = await Promise.all([
    listVisibleTasks(session),
    listActiveUsers(),
  ]);

  return (
    <>
      <AppHeader session={session} />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-6xl w-full mx-auto">
        <TaskDashboard tasks={tasks} users={users} currentUserId={session.sub} />
      </main>
    </>
  );
}
