import { createClient } from "@/lib/supabase/server";

export type LoyaltyStatus = {
  progress: number;
  required: number;
  rewardDue: boolean;
};

/** Klippekort-status for en kunde (opptjente klipp + om gratis er klart). */
export async function getLoyaltyStatus(customerId: string): Promise<LoyaltyStatus> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("loyalty_status", { p_customer: customerId });
    const r = (Array.isArray(data) ? data[0] : data) as
      | { progress?: number; required?: number; reward_due?: boolean }
      | undefined;
    return {
      progress: Number(r?.progress ?? 0),
      required: Number(r?.required ?? 10),
      rewardDue: Boolean(r?.reward_due),
    };
  } catch {
    return { progress: 0, required: 10, rewardDue: false };
  }
}
