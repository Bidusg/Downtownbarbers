import { getSiteSettings } from "@/lib/site-settings";
import { getSectionFlags } from "@/lib/site-section-flags";
import { getSiteTexts } from "@/lib/site-texts";
import { getSiteMedia, getSiteImages, getSiteCraft } from "@/lib/site-images";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";
import { SectionVisibilityManager } from "@/components/admin/SectionVisibilityManager";
import { SiteTextsManager } from "@/components/admin/SiteTextsManager";
import { MediaLibrary } from "@/components/admin/MediaLibrary";
import { SiteCraftManager } from "@/components/admin/SiteCraftManager";
import { SitePreview } from "@/components/admin/SitePreview";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function AdminNettside() {
  const [settings, sectionFlags, textOverrides, media, placements, craft] =
    await Promise.all([
      getSiteSettings(),
      getSectionFlags(),
      getSiteTexts(),
      getSiteMedia(),
      getSiteImages(true),
      getSiteCraft(true),
    ]);

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader
        title="Nettside"
        description="Styr hele forsiden fra ett sted: hvilke seksjoner som vises, all tekst (norsk + engelsk), bilder per seksjon, farge og innstillinger. Endringer vises med én gang du lagrer."
      />

      <SectionVisibilityManager flags={sectionFlags} />

      <SiteTextsManager overrides={textOverrides} />

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold">Bilder</h2>
          <p className="text-sm text-muted">
            Last opp bilder og velg hvilke som vises hvor på forsiden (hero,
            galleri, «Om oss», banner) – og i hvilken rekkefølge.
          </p>
        </div>
        <MediaLibrary media={media} placements={placements} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold">Håndverket</h2>
          <p className="text-sm text-muted">
            De tre blokkene (bilde + tittel + tekst) i «Håndverket»-seksjonen.
            Bildet velges fra galleriet over.
          </p>
        </div>
        <SiteCraftManager
          blocks={craft}
          media={media.filter((m) => m.kind === "image")}
        />
      </section>

      <SiteSettingsForm initial={settings} />

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
