"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type MenuOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

/**
 * Lightweight popover menu for inline field edits and "move to…" actions.
 * Click or Enter/Space to open, arrow keys to move, Escape or click-away
 * to close. Anchored under the trigger.
 */
export default function Menu({
  trigger,
  options,
  value,
  onSelect,
  align = "start",
  className,
}: {
  trigger: (props: { open: boolean }) => React.ReactNode;
  options: MenuOption[];
  value?: string;
  onSelect: (value: string) => void;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openMenu() {
    const i = options.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  }

  function choose(i: number) {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    onSelect(opt.value);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            openMenu();
          }
        }}
        className="inline-flex"
      >
        {trigger({ open })}
      </button>
      {open && (
        <div
          id={listId}
          role="menu"
          className={cn(
            "absolute z-50 mt-1 min-w-[11rem] overflow-hidden rounded-[var(--radius)] border border-border-strong bg-surface p-1 shadow-[var(--shadow-lg)] animate-[slideUp_120ms_ease-out]",
            align === "end" ? "right-0" : "left-0",
          )}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              choose(active);
            }
          }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          {options.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={opt.value === value}
              disabled={opt.disabled}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-40",
                i === active ? "bg-surface-2 text-fg" : "text-fg-muted",
                opt.value === value && "font-medium text-fg",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
