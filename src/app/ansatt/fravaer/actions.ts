"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type LeaveResult = { ok: true } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ansatt sender inn en fravaerssøknad for seg selv. staff_id + status
 *  utledes/tvinges server-side i submit_leave_request (SECURITY DEFINER),
 *  så klienten kan ikke sende på vegne av andre eller selv-godkjenne. */
export async function submitLeaveRequest(fd: FormData): Promise<LeaveResult> {
  try {
    await requireRole(["staff", "admin"]);

    const from = String(fd.get("from_date") ?? "").trim();
    const to = String(fd.get("to_date") ?? "").trim();
    const kind = String(fd.get("kind") ?? "ferie").trim();
    const note = String(fd.get("note") ?? "").trim();

    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return { ok: false, error: "Ugyldig dato." };
    }
    if (to < from) {
      return { ok: false, error: "Til-dato kan ikke være før fra-dato." };
    }

    const sb = await createClient();
    const { error } = await sb.rpc("submit_leave_request", {
      p_from: from,
      p_to: to,
      p_kind: kind || "ferie",
      p_note: note || null,
    });

    if (error) {
      return {
        ok: false,
        error: error.message || "Kunne ikke sende søknaden.",
      };
    }

    revalidatePath("/ansatt/fravaer");
    return { ok: true };
  } catch {
    return { ok: false, error: "Noe gikk galt." };
  }
}
