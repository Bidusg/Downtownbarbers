import { getSiteSettings } from "@/lib/site-settings";
import { getSiteImages } from "@/lib/site-images";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";
import { SiteImagesManager } from "@/components/admin/SiteImagesManager";
import { SitePreview } from "@/components/admin/SitePreview";

export const dynamic = "force-dynamic";

export default async function AdminNettside() {
  const [settings, images] = await Promise.all([
    getSiteSettings(),
    getSiteImages(true),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <h1 className="mb-2 font-display text-2xl font-bold">Nettside</h1>
        <p className="text-sm text-muted">
          Endre tekst, kontaktinfo, åpningstider, farge og bilder på den
          offentlige forsiden. Endringer vises med én gang du lagrer.
        </p>
      </div>

      <SiteSettingsForm initial={settings} />

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold">Bilder</h2>
          <p className="text-sm text-muted">
            Legg til, omordne, skjul eller slett bilder i hero-karusellen og
            galleriet. Nye bilder legger seg bakerst – bruk ↑/↓ for å endre
            rekkefølge. «Skjul» tar et bilde av forsiden uten å slette det (det
            vises fortsatt i forhåndsvisningen).
          </p>
        </div>
        <SiteImagesManager images={images} />
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
