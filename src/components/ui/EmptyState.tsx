import { cn } from "@/lib/cn";

export default function EmptyState({
  title,
  hint,
  className,
}: {
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-[var(--radius-lg)] border border-dashed border-border-strong px-6 py-10 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-fg-muted">{title}</p>
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
