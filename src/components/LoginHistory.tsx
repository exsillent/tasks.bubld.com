type LoginEntry = {
  id: string;
  email: string;
  ipAddress: string | null;
  createdAt: Date;
  user: { name: string } | null;
};

/** Yasir-only: recent successful logins, with IP. Caller must role-gate. */
export default function LoginHistory({ entries }: { entries: LoginEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-base font-bold text-fg">Recent logins</h2>
      <div className="overflow-hidden rounded-[var(--radius)] border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-fg-subtle">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Who</th>
              <th className="px-4 py-2 text-left font-medium">When</th>
              <th className="px-4 py-2 text-left font-medium">IP address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-2 font-medium text-fg">{entry.user?.name ?? entry.email}</td>
                <td className="px-4 py-2 tabular-nums text-fg-muted">
                  {new Date(entry.createdAt).toLocaleString("en-US", {
                    timeZone: "America/New_York",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-2 font-mono text-fg-subtle">{entry.ipAddress ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
