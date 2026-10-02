"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A small, dependency-free toast.
 *
 * The site had no way to confirm an action that happened away from the field being filled in — a
 * submitted story, an issue marked solved — so success and failure both had to be inferred from
 * whether the form reset. This renders transient confirmations instead, and deliberately keeps
 * only in-memory state: nothing is persisted and a reload clears it.
 */

type ToastTone = "success" | "error" | "info";

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

type ToastItem = ToastInput & { id: number; tone: ToastTone };

const ToastContext = React.createContext<{ toast: (input: ToastInput) => void } | null>(
  null,
);

/** Outside a provider this is a no-op so a component never has to know where it is rendered. */
export function useToast() {
  const context = React.useContext(ToastContext);
  return context ?? { toast: () => {} };
}

const TONE_CLASS: Record<ToastTone, string> = {
  success: "border-l-4 border-l-emerald-500",
  error: "border-l-4 border-l-destructive",
  info: "",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const counter = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: ToastInput) => {
      counter.current += 1;
      const id = counter.current;
      const tone = input.tone ?? "info";
      setItems((current) => [
        ...current.slice(-3),
        { id, tone, title: input.title, description: input.description },
      ]);
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 6000);
    },
    [],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:bottom-6 md:right-6 md:items-end md:px-0"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-[min(24rem,100%)] items-start gap-3 rounded-lg border bg-card p-3 shadow-lg",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2",
              TONE_CLASS[item.tone],
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="বন্ধ করুন"
              onClick={() => dismiss(item.id)}
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
