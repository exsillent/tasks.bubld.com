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
      <h2 className="axiBold text-lg text-neutral-900 mb-3">Recent logins</h2>
      <div className="rounded-xl border border-neutral-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-medium px-4 py-2">Who</th>
              <th className="text-left font-medium px-4 py-2">When</th>
              <th className="text-left font-medium px-4 py-2">IP address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-2 axiMed text-neutral-800">{entry.user?.name ?? entry.email}</td>
                <td className="px-4 py-2 text-neutral-600 tabular-nums">
                  {new Date(entry.createdAt).toLocaleString("en-US", {
                    timeZone: "America/New_York",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-2 text-neutral-500 font-mono">{entry.ipAddress ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
