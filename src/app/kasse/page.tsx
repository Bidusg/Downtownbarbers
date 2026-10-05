import { requireRole } from "@/lib/auth";
import { getClockBoard } from "@/app/kasse/stempling/actions";
import { getActiveNotices } from "@/lib/notices-queries";
import { NoticeBanner } from "@/components/admin/NoticeBanner";
import { KioskLanding } from "@/components/kasse/KioskLanding";
import { AutoRefresh } from "@/components/kasse/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function KasseDashboard() {
  await requireRole(["shop", "admin"]);
  const [board, notices] = await Promise.all([
    getClockBoard(),
    getActiveNotices("shop"),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <AutoRefresh seconds={60} />
      <NoticeBanner notices={notices} />
      <KioskLanding staff={board} />
    </main>
  );
}
