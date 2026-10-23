import { ShiftHoursReport } from "@/components/backoffice/ShiftHoursReport";

export const dynamic = "force-dynamic";

// Tilgang voktes av revisor-layouten. Lese-kun.
export default async function RevisorArbeidstid({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  return <ShiftHoursReport month={m} basePath="/revisor/arbeidstid" />;
}
