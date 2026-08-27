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
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-5 text-lg font-bold text-fg">New task</h1>
        <NewTaskForm users={users} appAreas={appAreas} isAdmin={session.role === "ADMIN"} />
      </main>
    </>
  );
}
