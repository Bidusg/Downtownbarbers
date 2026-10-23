"use server";

import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { runFollowups } from "@/lib/followups";

export async function sendFollowupsNow() {
  await requireRole(["admin"]);
  await runFollowups({ weeks: 6 });
  revalidatePath("/admin/oppfolging");
  revalidatePath("/admin/kunder");
}
