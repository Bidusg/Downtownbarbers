import { createClient } from "@/lib/supabase/server";

export const STAFF_DOCS_BUCKET = "staff-docs";

export type DocCategory = "kontrakt" | "lonnslipp" | "annet";

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

/** Innlogget ansatts egne dokumenter (RLS: self_read), med signerte URL-er. */
export async function getMyDocuments(): Promise<StaffDocumentWithUrl[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("staff_documents")
      .select(SELECT)
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
