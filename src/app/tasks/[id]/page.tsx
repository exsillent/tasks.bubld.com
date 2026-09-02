import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getVisibleTask, listActiveUsers, listAllAppAreas, seesOnlyOwnTasks } from "@/lib/tasks";
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
  const [task, users, allAppAreas] = await Promise.all([
    getVisibleTask(id, session),
    listActiveUsers(),
    listAllAppAreas(),
  ]);

  if (!task) notFound();

  // EXTERNAL contractors' tasks are always bubld.com, and the edit form's
  // app-area picker should reflect that -- the server pins it anyway.
  const appAreas = seesOnlyOwnTasks(session.role)
    ? allAppAreas.filter((a) => a.name === "bubld.com")
    : allAppAreas;

  return (
    <>
      <AppHeader session={session} />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-3xl w-full mx-auto">
        <TaskDetail task={task} users={users} appAreas={appAreas} session={session} />
      </main>
    </>
  );
}
