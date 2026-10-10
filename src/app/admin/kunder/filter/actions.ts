"use server";

import { getUserRole, isAdminRole } from "@/lib/auth";
import {
  filterCustomers,
  type CustomerFilter,
  type CustomerFilterRow,
} from "@/lib/customer-filter";

/** Kjør kunde-filteret (kun admin/eier). Returnerer radene som matcher. */
export async function runCustomerFilter(
  f: CustomerFilter,
): Promise<{ rows: CustomerFilterRow[]; error?: string }> {
  const me = await getUserRole();
  if (!me || !isAdminRole(me.role)) return { rows: [], error: "Ingen tilgang." };
  const rows = await filterCustomers(f);
  return { rows };
}
