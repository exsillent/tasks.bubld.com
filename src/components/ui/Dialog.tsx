"use client";

import { useEffect, useRef } from "react";
import { Button } from "./Button";

/**
 * In-app confirm dialog -- replaces window.confirm(). Focus moves to the
 * confirm button on open, Escape and backdrop click cancel, focus is
 * restored to whatever was focused before.
 */
export default function Dialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement;
    confirmRef.current?.focus();
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        aria-label="Cancel"
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 bg-[rgba(24,18,12,0.32)] animate-[overlayIn_120ms_ease-out]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="relative w-full max-w-sm rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-lg)] animate-[dialogIn_140ms_ease-out]"
      >
        <h2 id="dialog-title" className="text-base font-bold text-fg">
          {title}
        </h2>
        {body && <div className="mt-1.5 text-sm text-fg-muted">{body}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            className={destructive ? "bg-danger text-white hover:bg-danger-ink" : undefined}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
