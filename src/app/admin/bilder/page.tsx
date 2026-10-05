import { getSiteMedia, getSiteImages, getSiteCraft } from "@/lib/site-images";
import { MediaLibrary } from "@/components/admin/MediaLibrary";
import { SiteCraftManager } from "@/components/admin/SiteCraftManager";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function AdminBilder() {
  const [media, placements, craft] = await Promise.all([
    getSiteMedia(),
    getSiteImages(true),
    getSiteCraft(true),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader
        title="Bilder"
        description="Last opp bilder, se alt som finnes, og velg hvilke som vises hvor på forsiden – og i hvilken rekkefølge."
      />
      <MediaLibrary media={media} placements={placements} />

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold">Håndverket</h2>
          <p className="text-sm text-muted">
            De tre blokkene (bilde + tittel + tekst) i «Håndverket»-seksjonen.
            Bildet velges fra galleriet over.
          </p>
        </div>
        <SiteCraftManager blocks={craft} media={media.filter((m) => m.kind === "image")} />
      </section>
    </div>
  );
}
