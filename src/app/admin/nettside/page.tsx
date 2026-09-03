import { getSiteSettings } from "@/lib/site-settings";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminNettside() {
  const settings = await getSiteSettings();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-2 font-display text-2xl font-bold">Nettside</h1>
      <p className="mb-6 text-sm text-muted">
        Endre tekst, kontaktinfo, åpningstider og farge på den offentlige
        forsiden. Endringer vises med én gang du lagrer.
      </p>
      <SiteSettingsForm initial={settings} />
    </div>
  );
}
