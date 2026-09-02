import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import type { SessionPayload } from "@/lib/jwt";

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm font-medium text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {label}
    </Link>
  );
}

export default function AppHeader({ session }: { session: SessionPayload }) {
  // An EXTERNAL contractor only sees their own tasks -- Builds (app-store
  // release batching) is meaningless to them, so it's dropped from the nav.
  const isExternal = session.role === "EXTERNAL";
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Bubld Tasks home">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, next/image adds nothing */}
            <img src="/media/logo.svg" alt="Bubld" className="h-[18px] w-auto" />
            <span className="hidden border-l border-border pl-2 text-sm font-medium text-fg-subtle sm:inline">
              Tasks
            </span>
          </Link>
          <nav className="flex items-center gap-0.5">
            <NavLink href="/" label="Board" />
            {!isExternal && <NavLink href="/builds" label="Builds" />}
            <NavLink href="/activity" label="Updates" />
            {session.role === "ADMIN" && <NavLink href="/admin" label="Settings" />}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {/* Plain <a>, not <Link> -- /tasks/new's literal path also matches
              the @modal slot's (.)tasks/[id] interception (id="new"), and
              Next's client router skips re-rendering `children` on an
              intercepted soft navigation. A real load bypasses interception
              and lands on the full-page form. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/tasks/new"
            className="inline-flex h-8 items-center justify-center rounded-[var(--radius-sm)] bg-brand px-3 text-[0.8125rem] font-medium text-white transition-colors hover:bg-brand-hover"
          >
            + New task
          </a>
          <div className="flex items-center gap-2">
            <Avatar name={session.name} size={26} />
            <span className="hidden text-sm font-medium text-fg sm:inline">{session.name}</span>
            <form action={logoutAction}>
              <Button variant="ghost" size="sm" type="submit" className="px-2 text-fg-subtle">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
