import { ShiftHoursReport } from "@/components/backoffice/ShiftHoursReport";

export const dynamic = "force-dynamic";

export default async function AdminArbeidstid({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  return <ShiftHoursReport month={m} basePath="/admin/arbeidstid" />;
}
