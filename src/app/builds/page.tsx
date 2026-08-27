import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listBuilds } from "@/lib/tasks";
import AppHeader from "@/components/AppHeader";
import BuildsView from "@/components/BuildsView";

export default async function BuildsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { open, shipped, isAdmin } = await listBuilds(session);

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-1 text-lg font-bold text-fg">Builds</h1>
        <p className="mb-5 text-sm text-fg-subtle">
          The next app-store build for the Customer and Technician apps, and everything shipped
          before it.
        </p>
        <BuildsView open={open} shipped={shipped} isAdmin={isAdmin} />
      </main>
    </>
  );
}
