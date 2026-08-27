import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listVisibleTasks, listActiveUsers, listAllAppAreas } from "@/lib/tasks";
import AppHeader from "@/components/AppHeader";
import BoardView from "@/components/board/BoardView";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [tasks, users, appAreas] = await Promise.all([
    listVisibleTasks(session),
    listActiveUsers(),
    listAllAppAreas(),
  ]);

  const openBuild = tasks.find((t) => t.build && !t.build.shippedAt)?.build ?? null;

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-[1500px] flex-1 px-3 py-5 sm:px-6">
        <BoardView
          tasks={tasks}
          users={users}
          appAreas={appAreas}
          openBuildNumber={openBuild?.number ?? null}
          me={{ id: session.sub, role: session.role, name: session.name }}
        />
      </main>
    </>
  );
}
