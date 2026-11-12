import { createClient } from "@/lib/supabase/server";
import { getMyStaffLink } from "@/lib/ansatt-queries";

export const STAFF_DOCS_BUCKET = "staff-docs";

export type DocCategory = "kontrakt" | "lonnslipp" | "annet" | "oppsigelse";

export type StaffDocument = {
  id: string;
  staff_id: string;
  category: DocCategory;
  name: string;
  path: string;
  period: string | null;
  size_bytes: number | null;
  mime: string | null;
  by_staff: boolean;
  created_at: string;
};

export type StaffDocumentWithUrl = StaffDocument & { url: string | null };

const SELECT =
  "id, staff_id, category, name, path, period, size_bytes, mime, by_staff, created_at";

type SbClient = Awaited<ReturnType<typeof createClient>>;

/** Signert nedlastings-URL for et objekt i den private bøtta (1 time). */
export async function signStaffDocUrl(
  sb: SbClient,
  path: string,
): Promise<string | null> {
  try {
    const { data } = await sb.storage
      .from(STAFF_DOCS_BUCKET)
      .createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

async function withUrls(
  sb: SbClient,
  rows: StaffDocument[],
): Promise<StaffDocumentWithUrl[]> {
  return Promise.all(
    rows.map(async (d) => ({ ...d, url: await signStaffDocUrl(sb, d.path) })),
  );
}

/** Innlogget ansatts egne dokumenter (filtrert på egen staff_id), med signerte URL-er.
 *  Uten filter ville admin/revisor (som RLS lar se alt) fått ALLES dokumenter. */
export async function getMyDocuments(): Promise<StaffDocumentWithUrl[]> {
  try {
    const link = await getMyStaffLink();
    if (!link.linked || !link.staffId) return [];
    const sb = await createClient();
    const { data } = await sb
      .from("staff_documents")
      .select(SELECT)
      .eq("staff_id", link.staffId)
      .order("category")
      .order("created_at", { ascending: false });
    return withUrls(sb, (data as StaffDocument[] | null) ?? []);
  } catch {
    return [];
  }
}

/** Dokumenter for én ansatt (admin/revisor via RLS), med signerte URL-er. */
export async function getStaffDocuments(
  staffId: string,
): Promise<StaffDocumentWithUrl[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff_documents")
      .select(SELECT)
      .eq("staff_id", staffId)
      .order("category")
      .order("created_at", { ascending: false });
    return withUrls(sb, (data as StaffDocument[] | null) ?? []);
  } catch {
    return [];
  }
}
