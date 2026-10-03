import { getDueFollowups } from "@/lib/followups";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmpty,
} from "@/components/ui/Table";
import { sendFollowupsNow } from "./actions";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default async function AdminOppfolging() {
  const due = await getDueFollowups(6);
  const hasAi = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Oppfølging"
        description={`Kunder som ikke har vært innom på 6+ uker og ikke har en kommende time. De får en vennlig «book ny time»-e-post${
          hasAi
            ? ", skrevet av AI (Claude)"
            : " (fast mal – legg til ANTHROPIC_API_KEY i Vercel for AI-tekst)"
        }. Oppfølging kjører også automatisk hver dag.`}
        actions={<span className="text-sm text-muted">{due.length} klar</span>}
      />

      {!hasAi && (
        <div className="mb-5 border border-line bg-surface px-4 py-3 text-xs text-muted">
          💡 AI-tekst er ikke aktivert enda. Legg til en Anthropic-nøkkel som
          <span className="text-fg"> ANTHROPIC_API_KEY </span>
          i Vercel-miljøvariablene, så skriver Claude personlige meldinger. Uten
          nøkkel brukes en pen standardmal.
        </div>
      )}

      {due.length > 0 && (
        <form action={sendFollowupsNow} className="mb-5">
          <Button type="submit" className="px-4 py-2 text-sm">
            Send oppfølging nå ({due.length})
          </Button>
        </form>
      )}

      <Card padded={false}>
        <Table>
          <THead>
            <Tr head className="bg-surface-2 tracking-wide uppercase">
              <Th>Kunde</Th>
              <Th>E-post</Th>
              <Th>Siste tjeneste</Th>
              <Th>Sist besøk</Th>
              <Th>Uker siden</Th>
            </Tr>
          </THead>
          <TBody>
            {due.length === 0 && (
              <TableEmpty colSpan={5}>
                Ingen kunder er klare for oppfølging akkurat nå. 👍
              </TableEmpty>
            )}
            {due.map((c) => (
              <Tr key={c.customer_id}>
                <Td className="font-medium text-fg">{c.full_name}</Td>
                <Td muted>{c.email ?? "—"}</Td>
                <Td muted>{c.last_service ?? "—"}</Td>
                <Td muted>{fmtDate(c.last_visit)}</Td>
                <Td className="font-display">{c.weeks_since}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
