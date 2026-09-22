import { getSiteSettings } from "@/lib/site-settings";
import { getSiteImages, getSiteCraft } from "@/lib/site-images";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";
import { SiteImagesManager } from "@/components/admin/SiteImagesManager";
import { SiteCraftManager } from "@/components/admin/SiteCraftManager";
import { SitePreview } from "@/components/admin/SitePreview";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function AdminNettside() {
  const [settings, images, craft] = await Promise.all([
    getSiteSettings(),
    getSiteImages(true),
    getSiteCraft(true),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <PageHeader
        title="Nettside"
        description="Endre tekst, kontaktinfo, åpningstider, farge og bilder på den offentlige forsiden. Endringer vises med én gang du lagrer."
      />

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
          <h2 className="font-display text-xl font-bold">Håndverket</h2>
          <p className="text-sm text-muted">
            Blokkene (bilde + tittel + tekst) i «Håndverket»-seksjonen. Rediger
            tekst, omordne med ↑/↓, skjul eller slett. Uten egne blokker viser
            forsiden standardinnholdet.
          </p>
        </div>
        <SiteCraftManager blocks={craft} />
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
