import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getVisibleTask, listActiveUsers, listAllAppAreas } from "@/lib/tasks";
import TaskModal from "@/components/TaskModal";
import TaskDetail from "@/app/tasks/[id]/TaskDetail";

// Intercepts client-side navigation to /tasks/[id] from anywhere within
// this layout (the task list) and renders it as a slide-over instead of a
// full page -- the list underneath keeps its filters, scroll position, and
// URL. Direct navigation (refresh, shared link, typed URL) bypasses this
// and hits the real app/tasks/[id]/page.tsx instead, per Next's own
// intercepting-routes convention.
export default async function InterceptedTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // /tasks/new is a real, separate static route (app/tasks/new/page.tsx),
  // but this dynamic [id] segment matches its literal path too. A static
  // sibling under @modal doesn't win the way it does for the real children
  // slot -- interception routing doesn't follow normal precedence -- so
  // this has to be handled in code: bail out to null and let the actual
  // /tasks/new page (in the children slot, untouched by this slot) render
  // normally with no modal overlay.
  if (id === "new") return null;

  const session = await getSession();
  if (!session) redirect("/login");

  const [task, users, appAreas] = await Promise.all([
    getVisibleTask(id, session),
    listActiveUsers(),
    listAllAppAreas(),
  ]);

  if (!task) notFound();

  return (
    <TaskModal>
      <TaskDetail task={task} users={users} appAreas={appAreas} session={session} />
    </TaskModal>
  );
}
