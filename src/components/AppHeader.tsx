import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/app/actions";
import type { SessionPayload } from "@/lib/jwt";

export default function AppHeader({ session }: { session: SessionPayload }) {
  return (
    <header className="border-b border-neutral-200 px-4 sm:px-6 py-3 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/media/logo.svg" alt="Bubld" width={90} height={26} priority />
        <span className="axiBold text-sm text-neutral-500 hidden sm:inline">Tasks</span>
      </Link>
      <div className="flex items-center gap-4">
        {session.role === "ADMIN" && (
          <Link
            href="/admin"
            className="text-sm text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            Settings
          </Link>
        )}
        <Link
          href="/tasks/new"
          className="axiMed text-sm bg-brand text-white rounded-lg px-3.5 py-1.5 hover:opacity-90 transition-opacity"
        >
          + New Task
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <span className="axiMed text-neutral-700">{session.name}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-neutral-400 hover:text-neutral-700 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
