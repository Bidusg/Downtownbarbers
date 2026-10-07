import { getSiteSettings } from "@/lib/site-settings";
import { getSectionFlags } from "@/lib/site-section-flags";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";
import { SectionVisibilityManager } from "@/components/admin/SectionVisibilityManager";
import Link from "next/link";
import { SitePreview } from "@/components/admin/SitePreview";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function AdminNettside() {
  const [settings, sectionFlags] = await Promise.all([
    getSiteSettings(),
    getSectionFlags(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <PageHeader
        title="Nettside"
        description="Endre tekst, kontaktinfo, åpningstider, farge og bilder på den offentlige forsiden. Endringer vises med én gang du lagrer."
      />

      <SectionVisibilityManager flags={sectionFlags} />

      <SiteSettingsForm initial={settings} />

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold">Bilder</h2>
        <p className="text-sm text-muted">
          Bildene på forsiden (hero, galleri, «Om oss», banner og Håndverket)
          styres nå fra et eget bildegalleri der du ser alt som er lastet opp og
          velger hva som vises hvor.
        </p>
        <Link
          href="/admin/bilder"
          className="inline-block border border-line-2 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent-soft"
        >
          Åpne bildegalleriet →
        </Link>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold">Forhåndsvisning</h2>
          <p className="text-sm text-muted">
            Se hvordan forsiden ser ut med endringene dine.
          </p>
        </div>
        <SitePreview />
      </section>
    </div>
  );
}
