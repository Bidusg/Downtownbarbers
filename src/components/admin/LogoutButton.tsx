"use client";

import { useTransition } from "react";
import { signOut } from "@/app/auth-actions";

export function LogoutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => signOut())}
      disabled={pending}
      className="border border-line-2 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent-soft hover:text-fg disabled:opacity-40"
    >
      {pending ? "Logger ut …" : "Logg ut"}
    </button>
  );
}
