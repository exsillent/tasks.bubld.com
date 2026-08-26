"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Slide-over panel for task detail, opened via an intercepted route
// (app/@modal/(.)tasks/[id]) so the list underneath keeps its filters/scroll
// position intact -- closing just calls router.back(), which returns to
// whatever filtered view was open, no state to lose.
export default function TaskModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  function close() {
    router.back();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-neutral-900/30 backdrop-blur-[1px] animate-[fadeIn_150ms_ease-out]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto animate-[slideIn_200ms_ease-out] flex flex-col"
      >
        <div className="sticky top-0 z-10 flex items-center justify-end border-b border-neutral-100 bg-white/90 backdrop-blur px-4 py-2.5">
          <button
            onClick={close}
            aria-label="Close task detail"
            className="rounded-lg p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 px-5 sm:px-8 py-6">{children}</div>
      </div>
    </div>
  );
}
