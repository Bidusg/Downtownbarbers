import { OnlineOrdersPage } from "@/components/kasse/OnlineOrdersPage";

export const dynamic = "force-dynamic";

/** Nettordrer i admin – samme behandling som i kassa, men admin blir i admin. */
export default function AdminNettordrer() {
  return <OnlineOrdersPage className="mx-auto max-w-5xl space-y-6" />;
}
