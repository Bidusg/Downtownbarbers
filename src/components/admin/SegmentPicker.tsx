"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/ui/Input";
import { runCustomerFilter } from "@/app/admin/kunder/filter/actions";
import type { BarberOption } from "@/lib/customer-filter";

const field =
  "h-10 rounded-[10px] border border-line-2 bg-canvas px-3 text-sm text-fg outline-none focus:border-accent-soft";

/**
 * Segment i Markedsføring. «Egendefinert filter» gir de samme filtrene som
 * Kunder → Filtrer kunder (barber, ikke besøkt, forbruk, søk). Mottakere er
 * alltid bare kunder med samtykke.
 */
export function SegmentPicker({
  segments,
  barbers,
}: {
  segments: { key: string; label: string; hint: string }[];
  barbers: BarberOption[];
}) {
  const [segment, setSegment] = useState(segments[0]?.key ?? "all");
  const [useBarber, setUseBarber] = useState(false);
  const [barberId, setBarberId] = useState(barbers[0]?.id ?? "");
  const [useVisit, setUseVisit] = useState(false);
  const [days, setDays] = useState("90");
  const [useSpend, setUseSpend] = useState(false);
  const [minSpent, setMinSpent] = useState("1000");
  const [q, setQ] = useState("");
  const [count, setCount] = useState<{ email: number; sms: number } | null>(null);
  const [pending, start] = useTransition();

  const filter = {
    barberId: useBarber ? barberId : null,
    notVisitedDays: useVisit ? Math.max(1, Number(days) || 0) : null,
    minSpent: useSpend ? Math.max(0, Number(minSpent) || 0) : null,
    q: q.trim() || null,
  };
  const isFilter = segment === "filter";

  function countRecipients() {
    start(async () => {
      const r = await runCustomerFilter({ ...filter, consent: "yes" });
      const rows = r.rows ?? [];
      setCount({
        email: rows.filter((x) => x.consent && x.email).length,
        sms: rows.filter((x) => x.consent && x.phone).length,
      });
    });
  }
  const changed = () => setCount(null);

  const line = (on: boolean, setOn: (v: boolean) => void, label: string, child: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <label className="flex w-44 shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-fg">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            changed();
          }}
          className="h-4 w-4 accent-[#F47721]"
        />
        {label}
      </label>
      <div className={on ? "" : "pointer-events-none opacity-40"}>{child}</div>
    </div>
  );

  return (
    <div>
      <label className="mb-1 block text-xs text-muted">Mottakere</label>
      <Select
        name="segment"
        value={segment}
        onChange={(e) => {
          setSegment(e.target.value);
          changed();
        }}
        className="sm:w-auto"
      >
        {segments.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label} — {s.hint}
          </option>
        ))}
        <option value="filter">Egendefinert filter — velg barber, besøk, forbruk eller søk</option>
      </Select>

      {isFilter && (
        <div className="mt-3 rounded-xl border border-line bg-canvas p-4">
          <input type="hidden" name="filter_json" value={JSON.stringify(filter)} />
          <div className="divide-y divide-line">
            {line(
              useBarber,
              setUseBarber,
              "Klippet av barber",
              <select
                value={barberId}
                onChange={(e) => {
                  setBarberId(e.target.value);
                  changed();
                }}
                className={field}
              >
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.active ? "" : " (inaktiv)"}
                  </option>
                ))}
              </select>,
            )}
            {line(
              useVisit,
              setUseVisit,
              "Ikke besøkt på",
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={days}
                  onChange={(e) => {
                    setDays(e.target.value);
                    changed();
                  }}
                  className={field + " w-24"}
                />
                <span className="text-sm text-muted">dager eller mer</span>
              </span>,
            )}
            {line(
              useSpend,
              setUseSpend,
              "Forbruk minst",
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={minSpent}
                  onChange={(e) => {
                    setMinSpent(e.target.value);
                    changed();
                  }}
                  className={field + " w-28"}
                />
                <span className="text-sm text-muted">kr totalt</span>
              </span>,
            )}
            <div className="flex flex-wrap items-center gap-3 py-2">
              <span className="w-44 shrink-0 text-sm font-medium text-fg">Søk</span>
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  changed();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault(); // ikke send skjemaet
                }}
                placeholder="Navn, telefon eller e-post"
                className={field + " w-full max-w-xs"}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={countRecipients} disabled={pending} className="act act-accent">
              {pending ? "Teller …" : "Tell mottakere"}
            </button>
            {count && (
              <span className="text-sm text-fg tabular-nums">
                <strong>{count.email}</strong> får e-post · <strong>{count.sms}</strong> kan få SMS
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">Bare kunder som har sagt ja til markedsføring får utsendingen.</p>
        </div>
      )}
    </div>
  );
}
