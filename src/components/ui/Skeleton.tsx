import { cn } from "@/lib/cn";

export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] bg-[linear-gradient(90deg,var(--surface-2)_25%,var(--surface-3)_37%,var(--surface-2)_63%)] bg-[length:400%_100%] animate-[shimmer_1.4s_ease-in-out_infinite]",
        className,
      )}
    />
  );
}
