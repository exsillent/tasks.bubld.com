import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listAllUsers, listAllAppAreas } from "@/lib/tasks";
import AppHeader from "@/components/AppHeader";
import AdminPanel from "./AdminPanel";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Not just hidden from the nav -- a non-admin hitting this URL directly
  // gets a 404, same enforcement pattern as draft tasks and private
  // comments (server-side, not just a client-side role check).
  if (session.role !== "ADMIN") notFound();

  const [users, appAreas] = await Promise.all([listAllUsers(), listAllAppAreas()]);

  return (
    <>
      <AppHeader session={session} />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-3xl w-full mx-auto">
        <h1 className="axiBold text-lg text-neutral-900 mb-5">Settings</h1>
        <AdminPanel users={users} appAreas={appAreas} />
      </main>
    </>
  );
}
