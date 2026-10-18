import type { SmsLogRow } from "@/lib/sms";

const TONE: Record<string, string> = {
  sendt: "bg-emerald-600/15 text-emerald-700",
  feilet: "bg-danger/15 text-danger",
  "hoppet over": "bg-surface-2 text-muted",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Siste SMS-er systemet har sendt (eller prøvd å sende), med status. */
export function SmsLog({ rows, missingTable }: { rows: SmsLogRow[]; missingTable: boolean }) {
  if (missingTable) {
    return (
      <p className="text-sm text-muted">
        Kjør <code className="rounded bg-surface-2 px-1">KJØR-I-SUPABASE-SMS-LOGG.sql</code> i
        Supabase for å slå på loggen.
      </p>
    );
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Ingen SMS er sendt ennå.</p>;
  }
  const weekAgo = Date.now() - 7 * 864e5;
  const recent = rows.filter((r) => new Date(r.created_at).getTime() >= weekAgo);
  const sent = recent.filter((r) => r.status === "sendt").length;
  const failed = recent.filter((r) => r.status === "feilet").length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Siste 7 dager: <span className="font-semibold text-fg">{sent} sendt</span>
        {failed > 0 && (
          <>
            {" · "}
            <span className="font-semibold text-danger">{failed} feilet</span>
          </>
        )}
      </p>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Tid</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Til</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Melding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap text-muted">{when(r.created_at)}</td>
                <td className="px-3 py-2 whitespace-nowrap capitalize">{r.kind}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.to_number ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={"rounded px-2 py-0.5 text-xs font-semibold " + (TONE[r.status] ?? TONE["hoppet over"])}>
                    {r.status}
                  </span>
                  {r.error && <span className="mt-1 block max-w-[16rem] text-xs text-danger">{r.error}</span>}
                </td>
                <td className="max-w-[28rem] px-3 py-2 text-muted">
                  <span className="line-clamp-2" title={r.body ?? ""}>
                    {r.body}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
