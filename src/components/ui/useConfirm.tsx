"use client";

import { useCallback, useRef, useState } from "react";
import Dialog from "./Dialog";

type ConfirmOptions = {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/**
 * Imperative confirm dialog. `confirm(opts)` returns a promise that
 * resolves true/false. Render `dialog` once somewhere in the component.
 *
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   if (await confirm({ title: "Delete this task?", destructive: true })) { ... }
 *   ...
 *   return (<>{dialog}...</>);
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setBusy(false);
    setState({ ...opts, open: true });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState((s) => (s ? { ...s, open: false } : s));
  }, []);

  const dialog = state ? (
    <Dialog
      open={state.open}
      title={state.title}
      body={state.body}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      destructive={state.destructive}
      busy={busy}
      onConfirm={() => {
        setBusy(true);
        finish(true);
      }}
      onCancel={() => finish(false)}
    />
  ) : null;

  return { confirm, dialog };
}
