"use client";

import { useEffect } from "react";
import { LoginForm } from "@/app/logg-inn/LoginForm";

/**
 * Innlogging som popup over den offentlige siden (i stedet for egen side),
 * slik at besøkende fortsatt ser nettsiden i bakgrunnen. Den eneste måten å
 * logge inn på – /logg-inn sender hit (/?login=1).
 */
export function LoginModal({
  open,
  onClose,
  accessDenied = false,
  passwordReset = false,
}: {
  open: boolean;
  onClose: () => void;
  accessDenied?: boolean;
  passwordReset?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Logg inn"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-line bg-canvas p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Lukk"
          className="absolute top-3 right-3 text-2xl leading-none text-muted hover:text-fg"
        >
          ×
        </button>
        <LoginForm compact accessDenied={accessDenied} passwordReset={passwordReset} />
      </div>
    </div>
  );
}
