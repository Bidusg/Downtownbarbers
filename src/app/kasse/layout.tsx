import { requireRole } from "@/lib/auth";
import { Topbar } from "@/components/backoffice/Topbar";
import { PageTransition } from "@/components/backoffice/PageTransition";
import { kasseNav } from "@/lib/backoffice-nav";
import { getMissingSettlementDays } from "@/lib/settlement-status";
import { SettlementReminderBanner } from "@/components/admin/SettlementReminderBanner";
import { NoticeBanner } from "@/components/admin/NoticeBanner";
import { getActiveNotices } from "@/lib/notices-queries";
import { countOpenCrisisRequests } from "@/lib/crisis-queries";
import { countOpenOnlineOrders } from "@/lib/online-order-queries";
import Link from "next/link";

export default async function KasseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["shop", "admin"]);
  const [missing, notices, crisis, webOrders] = await Promise.all([
    getMissingSettlementDays(),
    getActiveNotices("shop"),
    countOpenCrisisRequests(),
    countOpenOnlineOrders(),
  ]);

  return (
    <div className="bo-app min-h-screen overflow-x-clip bg-canvas text-fg">
      <Topbar role="Kasse" homeHref="/kasse" nav={kasseNav} />
      {crisis > 0 && (
        <div className="px-4 pt-4 sm:px-6">
          <Link
            href="/kasse/krisetimer"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-accent-soft bg-accent-soft/10 px-4 py-3 text-sm hover:bg-accent-soft/15"
          >
            <span className="text-fg">
              <strong>{crisis}</strong> kunde{crisis === 1 ? "" : "r"} trenger krisetime – ring og finn en luke.
            </span>
            <span className="font-semibold text-accent-soft">Se krisetimer →</span>
          </Link>
        </div>
      )}
      {webOrders > 0 && (
        <div className="px-4 pt-4 sm:px-6">
          <Link
            href="/kasse/nettordrer"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line-2 bg-surface px-4 py-3 text-sm hover:border-accent-soft"
          >
            <span className="text-fg">
              <strong>{webOrders}</strong> ny{webOrders === 1 ? "" : "e"} nettordre{webOrders === 1 ? "" : "r"} – plukk varene og gjør klar.
            </span>
            <span className="font-semibold text-accent-soft">Se nettordrer →</span>
          </Link>
        </div>
      )}
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
