import { RatingForm } from "@/components/RatingForm";

export const metadata = { title: "Vurder besøket | Downtown Barbers" };

export default async function VurderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 text-fg">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold">Downtown Barbers</p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
            Hvordan var besøket?
          </p>
        </div>
        <RatingForm bookingId={id} />
        <p className="mt-5 text-center text-xs text-muted">
          Din vurdering hjelper barberen din å bli enda bedre.
        </p>
      </div>
    </div>
  );
}
