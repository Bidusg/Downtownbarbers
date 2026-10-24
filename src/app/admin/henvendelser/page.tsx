import { PageHeader } from "@/components/ui/PageHeader";
import { ContactInbox } from "@/components/admin/ContactInbox";
import { getContactMessages } from "@/lib/contact-queries";

export const dynamic = "force-dynamic";

export default async function AdminHenvendelser() {
  const { rows, ready } = await getContactMessages();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Henvendelser"
        description="Meldinger fra kontaktskjemaet på nettsiden. Salongen får også en e-post for hver ny melding."
      />
      {!ready ? (
        <p className="bo-card border border-line bg-surface p-5 text-sm text-danger">
          Kjør KJØR-I-SUPABASE-KONTAKTSKJEMA.sql i Supabase først – da dukker meldingene opp her.
        </p>
      ) : (
        <ContactInbox key={rows.map((r) => r.id + r.status).join(",")} rows={rows} />
      )}
    </div>
  );
}
