import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "danger" | "warning" | "success" | "info" | "purple";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted",
  brand: "bg-brand-wash text-brand-ink",
  danger: "bg-danger-wash text-danger-ink",
  warning: "bg-warning-wash text-warning",
  success: "bg-success-wash text-success-ink",
  info: "bg-info-wash text-info",
  purple: "bg-[#f0e9fb] text-[#5f3aa8]",
};

export default function Badge({
  children,
  tone = "neutral",
  className,
  dot = false,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}
