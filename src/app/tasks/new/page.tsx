import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listActiveUsers, listActiveAppAreas } from "@/lib/tasks";
import AppHeader from "@/components/AppHeader";
import NewTaskForm from "./NewTaskForm";

export default async function NewTaskPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [users, appAreas] = await Promise.all([listActiveUsers(), listActiveAppAreas()]);

  return (
    <>
      <AppHeader session={session} />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-2xl w-full mx-auto">
        <h1 className="axiBold text-lg text-neutral-900 mb-5">New Task</h1>
        <NewTaskForm users={users} appAreas={appAreas} isAdmin={session.role === "ADMIN"} />
      </main>
    </>
  );
}
