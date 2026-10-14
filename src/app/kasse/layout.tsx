import { requireRole } from "@/lib/auth";
import { Topbar } from "@/components/backoffice/Topbar";
import { PageTransition } from "@/components/backoffice/PageTransition";
import { kasseNav } from "@/lib/backoffice-nav";
import { getMissingSettlementDays } from "@/lib/settlement-status";
import { SettlementReminderBanner } from "@/components/admin/SettlementReminderBanner";
import { NoticeBanner } from "@/components/admin/NoticeBanner";
import { getActiveNotices } from "@/lib/notices-queries";

export default async function KasseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["shop", "admin"]);
  const [missing, notices] = await Promise.all([
    getMissingSettlementDays(),
    getActiveNotices("shop"),
  ]);

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-fg">
      <Topbar role="Kasse" homeHref="/kasse" nav={kasseNav} />
      {missing.length > 0 && (
        <div className="px-4 pt-4 sm:px-6">
          <SettlementReminderBanner missing={missing} href="/kasse/kasseoppgjor" />
        </div>
      )}
      {notices.length > 0 && (
        <div className="px-4 pt-4 sm:px-6">
          <NoticeBanner notices={notices} />
        </div>
      )}
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
