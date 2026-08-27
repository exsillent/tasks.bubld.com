import { cn } from "@/lib/cn";

// Deterministic muted colour per name -- warm, low-saturation, all pass
// contrast with white text.
const COLORS = [
  "#b5480a",
  "#2f68b0",
  "#2f7d57",
  "#7b52c7",
  "#b06a12",
  "#a5495f",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/[\s_]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  size = 24,
  className,
  title,
}: {
  name: string | null | undefined;
  size?: number;
  className?: string;
  title?: string;
}) {
  const label = name?.trim() || "Unassigned";
  const isUnassigned = !name?.trim();
  return (
    <span
      title={title ?? label}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white select-none",
        isUnassigned && "text-fg-subtle",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: isUnassigned ? "var(--surface-3)" : COLORS[hash(label) % COLORS.length],
      }}
    >
      {isUnassigned ? "–" : initials(label)}
    </span>
  );
}
