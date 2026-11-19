"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Options = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** red confirm button (for delete) */
  danger?: boolean;
};

type Pending = Options & { resolve: (ok: boolean) => void };

const Ctx = createContext<(o: Options | string) => Promise<boolean>>(async () => false);

/** `const ok = await confirm({ message })` — in-page popup over a blurred backdrop */
export const useConfirm = () => useContext(Ctx);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((o: Options | string) => new Promise<boolean>((resolve) => {
    setPending({ ...(typeof o === "string" ? { message: o } : o), resolve });
  }), []);

  const close = useCallback((ok: boolean) => {
    setPending((p) => { p?.resolve(ok); return null; });
  }, []);

  useEffect(() => {
    if (!pending) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [pending, close]);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="dialog-backdrop absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => close(false)} />
          <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-title"
            className="dialog-panel relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${pending.danger ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>!</span>
              <div className="min-w-0">
                <h2 id="dlg-title" className="text-base font-semibold text-slate-900">{pending.title ?? (pending.danger ? "ยืนยันการลบ" : "ยืนยัน")}</h2>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-600">{pending.message}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => close(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                {pending.cancelText ?? "ยกเลิก"}
              </button>
              <button ref={okRef} onClick={() => close(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${pending.danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}>
                {pending.confirmText ?? (pending.danger ? "ลบ" : "ตกลง")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
