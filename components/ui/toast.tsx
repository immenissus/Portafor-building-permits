"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { X } from "lucide-react";

type Toast = { id: number; title: string; description?: string; action?: { label: string; onClick: () => void } };
type ToastContextValue = { toast: (toast: Omit<Toast, "id">) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((item: Omit<Toast, "id">) => {
    const id = Date.now();
    setItems((current) => [...current, { ...item, id }]);
    window.setTimeout(() => setItems((current) => current.filter((toastItem) => toastItem.id !== id)), 5500);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-stone-900">{item.title}</p>
                {item.description ? <p className="mt-1 text-sm text-stone-600">{item.description}</p> : null}
              </div>
              <button aria-label="Dismiss" onClick={() => setItems((current) => current.filter((toastItem) => toastItem.id !== item.id))}>
                <X className="h-4 w-4 text-stone-500" />
              </button>
            </div>
            {item.action ? (
              <button className="mt-3 text-sm font-medium text-teal-700" onClick={item.action.onClick}>
                {item.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
