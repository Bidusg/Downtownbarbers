"use server";

import { revalidatePath } from "next/cache";
import { runFollowups } from "@/lib/followups";

export async function sendFollowupsNow() {
  await runFollowups({ weeks: 6 });
  revalidatePath("/admin/oppfolging");
  revalidatePath("/admin/kunder");
}
