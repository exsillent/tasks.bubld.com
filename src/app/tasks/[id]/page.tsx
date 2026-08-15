import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getVisibleTask, listActiveUsers, listAllAppAreas } from "@/lib/tasks";
import AppHeader from "@/components/AppHeader";
import TaskDetail from "./TaskDetail";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const [task, users, appAreas] = await Promise.all([
    getVisibleTask(id, session),
    listActiveUsers(),
    listAllAppAreas(),
  ]);

  if (!task) notFound();

  return (
    <>
      <AppHeader session={session} />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-3xl w-full mx-auto">
        <TaskDetail task={task} users={users} appAreas={appAreas} session={session} />
      </main>
    </>
  );
}
