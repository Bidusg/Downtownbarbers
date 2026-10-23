import Link from "next/link";
import type { Metadata } from "next";
import { getBarberBySlug } from "@/lib/portfolio";
import { PublicPage, MessageTile } from "@/components/site/PublicPage";
import { PortfolioCarousel } from "@/components/site/PortfolioCarousel";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";
import { T, TF } from "@/lib/i18n/T";

export const dynamic = "force-dynamic";
export const viewport = PUBLIC_VIEWPORT;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBarberBySlug(slug);
  if (!b) return { title: "Barber | Downtown Barbers" };
  const title = `${b.name}${b.title ? ` – ${b.title}` : ""} | Downtown Barbers`;
  return {
    title,
    description: b.bio ?? `Se arbeidet til ${b.name} og bestill time hos Downtown Barbers i Oslo.`,
    openGraph: { title, images: b.images[0]?.url ? [b.images[0].url] : b.photoUrl ? [b.photoUrl] : undefined },
  };
}

export default async function BarberSide({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getBarberBySlug(slug);

  if (!b) {
    return (
      <PublicPage narrow>
        <MessageTile
          title={<T k="barber.notFound" />}
          action={
            <Link href="/#team" className="pill pill-soft">
              <T k="barber.seeTeam" />
            </Link>
          }
        />
      </PublicPage>
    );
  }

  const first = b.name.split(" ")[0];
  const bookHref = `/booking?barber=${encodeURIComponent(b.fullName)}`;

  return (
    <PublicPage>
      <div className="flex items-center gap-5">
        {b.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.photoUrl} alt={b.name} className="h-20 w-20 shrink-0 rounded-full object-cover sm:h-24 sm:w-24" />
        )}
        <div className="min-w-0">
          <p className="m-eyebrow">{b.title ?? "Barber"}</p>
          <h1 className="m-title mt-1 text-4xl sm:text-6xl">{b.name}</h1>
        </div>
      </div>

      {b.bio && <p className="m-lead mt-6 max-w-2xl whitespace-pre-line">{b.bio}</p>}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={bookHref} className="pill pill-primary">
          <TF k="barber.book" vars={{ name: first }} />
        </Link>
        <Link href="/#team" className="pill pill-soft">
          <T k="barber.seeTeam" />
        </Link>
      </div>

      {b.images.length > 0 && (
        <section className="mt-12" aria-labelledby="work-title">
          <h2 id="work-title" className="mb-4 text-xl font-semibold tracking-tight">
            <TF k="barber.workOf" vars={{ name: first }} />
          </h2>
          <PortfolioCarousel images={b.images} name={b.name} />
        </section>
      )}
    </PublicPage>
  );
}
