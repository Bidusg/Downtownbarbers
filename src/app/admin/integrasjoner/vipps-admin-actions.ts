"use server";

import { getUserRole, isAdminRole } from "@/lib/auth";
import { pingVipps } from "@/lib/vipps";

export type VippsTestResult = {
  ok: boolean;
  mode: "mock" | "test" | "production";
  message: string;
};

/** «Test Vipps-kobling» i admin. Henter kun access token – ingen betaling. */
export async function testVippsConnection(): Promise<
  VippsTestResult | { error: string }
> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { error: "Kun admin." };
  return pingVipps();
}
