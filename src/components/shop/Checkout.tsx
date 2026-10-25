"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useCart } from "@/components/shop/CartProvider";
import { FreeShippingBar, QtyStepper, Thumb, useShopData, useSuggestions } from "@/components/shop/ShopShell";
import { placeOrder, type PlaceOrderInput } from "@/app/butikk/actions";
import { kr } from "@/lib/shop-shared";
import { salon } from "@/lib/data/salon";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/* =====================================================================
 * KASSE – én side: kontakt → levering → betaling, med ordresammendrag
 * og «legg til før du betaler» ved siden av (som de store butikkene).
 * ===================================================================== */

type Member = { name: string; email: string; phone: string; tier: string; pct: number } | null;
type Delivery = "pickup" | "ship";
type Pay = "vipps" | "card" | "pay_at_pickup";

const SAVED = "dtb_checkout_v1";

const field =
  "h-12 w-full rounded-xl bg-surface px-4 text-[15px] text-fg shadow-[0_0_0_1px_oklch(var(--line-2))] outline-none placeholder:text-muted focus:shadow-[0_0_0_2px_oklch(var(--fg))] aria-[invalid=true]:shadow-[0_0_0_2px_oklch(var(--danger,60%_0.2_25))]";

function Option({
  name,
  value,
  checked,
  onChange,
  title,
  sub,
  right,
  disabled,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  sub?: string;
  right?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={
        "flex cursor-pointer items-start gap-3 rounded-2xl p-4 transition-shadow " +
        (checked ? "shadow-[0_0_0_2px_oklch(var(--fg))]" : "shadow-[0_0_0_1px_oklch(var(--line-2))] hover:shadow-[0_0_0_1px_oklch(var(--fg))]") +
        (disabled ? " pointer-events-none opacity-40" : "")
      }
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} className="mt-1 h-4 w-4 accent-[var(--color-fg)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        {sub && <span className="mt-0.5 block text-[13px] text-muted">{sub}</span>}
      </span>
      {right && <span className="text-sm font-semibold tabular-nums">{right}</span>}
    </label>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-canvas p-5 shadow-[0_0_0_1px_oklch(var(--line))] sm:p-7">
      <h2 className="flex items-center gap-3 text-lg font-semibold tracking-tight">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fg text-[13px] font-bold text-canvas">{n}</span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function Checkout({ member, terms: termsNode }: { member: Member; /** Kjøpsvilkårene (vises i et vindu over kassen). */ terms?: React.ReactNode }) {
  const [showTerms, setShowTerms] = useState(false);
  const { lines, setQty, remove, add, clear, ready } = useCart();
  const { byId, settings } = useShopData();
  const { lang, t } = useLanguage();
  const en = lang === "en";
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [delivery, setDelivery] = useState<Delivery>(settings.pickup ? "pickup" : "ship");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  // Første tilgjengelige betalingsmåte er valgt fra start.
  const firstPay = (d: Delivery): Pay =>
    settings.vipps ? "vipps" : settings.card ? "card" : d === "pickup" && settings.payAtPickup ? "pay_at_pickup" : "vipps";
  const [payment, setPayment] = useState<Pay>(() => firstPay(settings.pickup ? "pickup" : "ship"));
  const [note, setNote] = useState("");
  const [terms, setTerms] = useState(false);
  const [website, setWebsite] = useState("");

  // Husk kontaktinfo/adresse fra forrige kjøp (bare på denne enheten).
  useEffect(() => {
    if (member) return;
    try {
      const s = JSON.parse(window.localStorage.getItem(SAVED) ?? "null") as Record<string, string> | null;
      if (s) {
        /* eslint-disable react-hooks/set-state-in-effect -- engangs-utfylling etter hydrering */
        setName((v) => v || s.name || "");
        setEmail((v) => v || s.email || "");
        setPhone((v) => v || s.phone || "");
        setAddress((v) => v || s.address || "");
        setPostalCode((v) => v || s.postalCode || "");
        setCity((v) => v || s.city || "");
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      /* noop */
    }
  }, [member]);

  // Ferske priser/lager fra butikken; varer som ikke lenger finnes vises som utgått.
  const rows = useMemo(
    () =>
      lines.map((l) => {
        const p = byId.get(l.id);
        return { line: l, p, price: p?.price ?? l.price, gone: !p || p.stock <= 0 };
      }),
    [lines, byId],
  );
  const live = rows.filter((r) => !r.gone);
  const subtotal = live.reduce((s, r) => s + r.price * r.line.qty, 0);
  const discount = member && member.pct > 0 ? Math.round((subtotal * member.pct) / 100) : 0;
  const shipping = delivery === "ship" && subtotal - discount < settings.freeOverNok ? settings.shippingNok : 0;
  const total = subtotal - discount + shipping;

  // Mersalg i kassen: billige tillegg som passer det som ligger i kurven.
  const seeds = useMemo(() => lines.flatMap((l) => byId.get(l.id)?.related ?? []), [lines, byId]);
  const addOns = useSuggestions(
    lines.map((l) => l.id),
    seeds,
    4,
  ).filter((p) => p.price <= 400);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const shipOk = delivery !== "ship" || (address.trim().length > 3 && /^\d{4}$/.test(postalCode.trim()) && city.trim().length > 1);
  const valid = name.trim().length >= 2 && emailOk && phone.replace(/\D/g, "").length >= 8 && shipOk && terms && live.length > 0;

  const submit = () => {
    setTouched(true);
    setError(null);
    if (!valid) {
      setError(
        !terms
          ? en
            ? "Please accept the terms of sale."
            : "Du må godta kjøpsvilkårene."
          : en
            ? "Please check the highlighted fields."
            : "Sjekk feltene som er merket.",
      );
      return;
    }
    const input: PlaceOrderInput = {
      items: live.map((r) => ({ id: r.line.id, qty: r.line.qty })),
      name,
      email,
      phone,
      delivery,
      address,
      postalCode,
      city,
      payment,
      note,
      acceptTerms: terms,
      website,
    };
    start(async () => {
      const res = await placeOrder(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      try {
        window.localStorage.setItem(SAVED, JSON.stringify({ name, email, phone, address, postalCode, city }));
      } catch {
        /* noop */
      }
      window.location.href = res.redirectUrl;
    });
  };

  if (ready && lines.length === 0) {
    return (
      <main className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t("shop.empty")}</h1>
        <p className="mt-3 text-muted">{en ? "Find something you like in the shop." : "Finn noe du liker i butikken."}</p>
        <Link href="/butikk" className="pill pill-primary mt-8">
          {t("shop.continue")}
        </Link>
      </main>
    );
  }

  const inv = (bad: boolean) => (touched && bad ? true : undefined);
  const payLabel =
    payment === "pay_at_pickup"
      ? en
        ? "Place order"
        : "Fullfør bestillingen"
      : payment === "card"
        ? en
          ? `Pay ${kr(total)} by card`
          : `Betal ${kr(total)} med kort`
        : en
          ? `Pay ${kr(total)} with Vipps`
          : `Betal ${kr(total)} med Vipps`;

  const summary = (
    <div className="space-y-5">
      <ul className="divide-y divide-line">
        {rows.map(({ line: l, price, gone }) => (
          <li key={l.id} className={"flex gap-3 py-3 " + (gone ? "opacity-50" : "")}>
            <Thumb src={l.image} alt={l.name} small />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{l.name}</p>
              {gone ? (
                <p className="text-xs font-medium text-accent-soft">{en ? "No longer available" : "Ikke lenger tilgjengelig"}</p>
              ) : (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <QtyStepper qty={l.qty} max={Math.max(1, Math.min(20, byId.get(l.id)?.stock ?? 20))} onChange={(n) => setQty(l.id, n)} label={l.name} />
                  <span className="text-sm font-semibold tabular-nums">{kr(price * l.qty)}</span>
                </div>
              )}
              <button type="button" onClick={() => remove(l.id)} className="mt-1 text-xs text-muted underline hover:text-fg">
                {t("shop.remove")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {addOns.length > 0 && (
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-[13px] font-semibold">{en ? "Add before you pay" : "Legg til før du betaler"}</p>
          <ul className="mt-3 space-y-3">
            {addOns.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <Thumb src={p.images[0] ?? null} alt={p.name} small />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm">{p.name}</p>
                  <p className="text-xs text-muted tabular-nums">{kr(p.price)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => add(p)}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold shadow-[0_0_0_1px_oklch(var(--line-2))] hover:shadow-[0_0_0_1px_oklch(var(--fg))]"
                  aria-label={`${t("shop.add")}: ${p.name}`}
                >
                  + {t("shop.add")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {delivery === "ship" && <FreeShippingBar subtotal={subtotal - discount} />}

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">{t("shop.subtotal")}</dt>
          <dd className="tabular-nums">{kr(subtotal)}</dd>
        </div>
        {discount > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted">
              {en ? "Customer club" : "Kundeklubb"} {member?.tier ? `(${member.tier})` : ""} −{member?.pct} %
            </dt>
            <dd className="text-accent-soft tabular-nums">−{kr(discount)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted">{delivery === "ship" ? (en ? "Shipping" : "Frakt") : en ? "Pick-up" : "Henting"}</dt>
          <dd className="tabular-nums">{shipping > 0 ? kr(shipping) : en ? "Free" : "Gratis"}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <dt className="font-semibold">{en ? "Total" : "Totalt"}</dt>
          <dd className="text-xl font-semibold tabular-nums">{kr(total)}</dd>
        </div>
        <p className="text-xs text-muted">{en ? "Incl. VAT" : "Inkl. mva."}</p>
      </dl>
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl px-5 pt-6 pb-24 sm:pt-10">
      <Link href="/butikk" className="text-[13px] text-muted hover:text-fg hover:underline">
        ← {t("shop.continue")}
      </Link>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{en ? "Checkout" : "Kassen"}</h1>
      {member && (
        <p className="mt-2 text-sm text-muted">
          {en ? "Logged in as" : "Innlogget som"} <span className="font-medium text-fg">{member.name}</span>
          {member.pct > 0 && (en ? ` – your club discount is applied automatically.` : ` – kundeklubb-rabatten din trekkes automatisk.`)}
        </p>
      )}

      {/* Mobil: sammendrag som kan åpnes */}
      <div className="mt-5 rounded-2xl bg-surface lg:hidden">
        <button type="button" onClick={() => setShowSummary((v) => !v)} aria-expanded={showSummary} className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium">
          <span>
            {showSummary ? (en ? "Hide order summary" : "Skjul ordresammendrag") : en ? "Show order summary" : "Vis ordresammendrag"} ({lines.reduce((s, l) => s + l.qty, 0)})
          </span>
          <span className="font-semibold tabular-nums">{kr(total)}</span>
        </button>
        {showSummary && <div className="border-t border-line px-4 pb-4">{summary}</div>}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_400px] lg:items-start">
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Step n={1} title={en ? "Contact details" : "Kontaktinformasjon"}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-[13px] font-medium">{en ? "Full name" : "Fullt navn"}</span>
                <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required aria-invalid={inv(name.trim().length < 2)} />
              </label>
              <label>
                <span className="mb-1.5 block text-[13px] font-medium">{en ? "Email" : "E-post"}</span>
                <input className={field} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" spellCheck={false} required aria-invalid={inv(!emailOk)} />
              </label>
              <label>
                <span className="mb-1.5 block text-[13px] font-medium">{en ? "Mobile" : "Mobil"}</span>
                <input className={field} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required aria-invalid={inv(phone.replace(/\D/g, "").length < 8)} />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">{en ? "We send the receipt and updates about your order here." : "Hit sender vi kvittering og beskjed om ordren."}</p>
            <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden />
          </Step>

          <Step n={2} title={en ? "Delivery" : "Levering"}>
            <div className="grid gap-3">
              {settings.pickup && (
                <Option
                  name="delivery"
                  value="pickup"
                  checked={delivery === "pickup"}
                  onChange={() => setDelivery("pickup")}
                  title={en ? "Pick up in the salon" : "Hent i salongen"}
                  sub={`${salon.address} · ${en ? "we'll let you know when it's ready" : "vi gir beskjed når den er klar"}`}
                  right={en ? "Free" : "Gratis"}
                />
              )}
              {settings.ship && (
                <Option
                  name="delivery"
                  value="ship"
                  checked={delivery === "ship"}
                  onChange={() => {
                    setDelivery("ship");
                    if (payment === "pay_at_pickup") setPayment(firstPay("ship"));
                  }}
                  title={en ? "Home delivery with Posten" : "Send hjem med Posten"}
                  sub={en ? "2–5 working days, to your mailbox or pick-up point" : "2–5 virkedager, i postkassen eller til hentested"}
                  right={subtotal - discount >= settings.freeOverNok ? (en ? "Free" : "Gratis") : kr(settings.shippingNok)}
                />
              )}
            </div>
            {delivery === "ship" && (
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-[13px] font-medium">{en ? "Street address" : "Gateadresse"}</span>
                  <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" aria-invalid={inv(address.trim().length <= 3)} />
                </label>
                <label>
                  <span className="mb-1.5 block text-[13px] font-medium">{en ? "Postcode" : "Postnummer"}</span>
                  <input
                    className={field}
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    aria-invalid={inv(!/^\d{4}$/.test(postalCode))}
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-[13px] font-medium">{en ? "City" : "Poststed"}</span>
                  <input className={field} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" aria-invalid={inv(city.trim().length <= 1)} />
                </label>
              </div>
            )}
          </Step>

          <Step n={3} title={en ? "Payment" : "Betaling"}>
            <div className="grid gap-3">
              {settings.vipps && (
                <Option
                  name="pay"
                  value="vipps"
                  checked={payment === "vipps"}
                  onChange={() => setPayment("vipps")}
                  title="Vipps"
                  sub={en ? "You approve in the Vipps app. We charge when the order is handed over or shipped." : "Du godkjenner i Vipps-appen. Beløpet trekkes først når varene er utlevert eller sendt."}
                />
              )}
              {settings.card && (
                <Option
                  name="pay"
                  value="card"
                  checked={payment === "card"}
                  onChange={() => setPayment("card")}
                  title={en ? "Card (Visa / Mastercard)" : "Kort (Visa / Mastercard)"}
                  sub={en ? "Secure card payment through Vipps – no app needed." : "Trygg kortbetaling via Vipps – du trenger ikke appen."}
                />
              )}
              {settings.payAtPickup && settings.pickup && (
                <Option
                  name="pay"
                  value="pay_at_pickup"
                  checked={payment === "pay_at_pickup"}
                  onChange={() => setPayment("pay_at_pickup")}
                  disabled={delivery !== "pickup"}
                  title={en ? "Pay when you pick up" : "Betal ved henting"}
                  sub={delivery !== "pickup" ? (en ? "Only for pick-up in the salon" : "Bare ved henting i salongen") : en ? "Card, Vipps or cash in the salon" : "Kort, Vipps eller kontant i salongen"}
                />
              )}
            </div>

            <label className="mt-5 block">
              <span className="mb-1.5 block text-[13px] font-medium">{en ? "Message to us (optional)" : "Melding til oss (valgfritt)"}</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} className={field + " h-auto py-3"} />
            </label>

            <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-fg)]" aria-invalid={inv(!terms)} />
              <span>
                {en ? "I accept the " : "Jeg godtar "}
                {termsNode ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowTerms(true);
                    }}
                    className="underline"
                  >
                    {en ? "terms of sale" : "kjøpsvilkårene"}
                  </button>
                ) : (
                  <Link href="/kjopsvilkar" target="_blank" className="underline">
                    {en ? "terms of sale" : "kjøpsvilkårene"}
                  </Link>
                )}
                {en ? " and have read the " : " og har lest "}
                <Link href="/personvern" target="_blank" className="underline">
                  {en ? "privacy policy" : "personvernerklæringen"}
                </Link>
                .
              </span>
            </label>

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-[oklch(60%_0.2_25/0.12)] px-4 py-3 text-sm font-medium">
                {error}
              </p>
            )}

            <button type="submit" disabled={pending || live.length === 0} className="pill pill-primary mt-5 w-full text-base disabled:opacity-50">
              {pending ? (en ? "One moment …" : "Et øyeblikk …") : payLabel}
            </button>
            <p className="mt-3 text-center text-xs text-muted">
              {en ? "14-day right of withdrawal · Secure payment" : "14 dagers angrerett · Trygg betaling"}
            </p>
            {lines.length > 0 && (
              <button type="button" onClick={clear} className="mt-2 block w-full text-center text-xs text-muted underline hover:text-fg">
                {en ? "Empty bag" : "Tøm handlekurven"}
              </button>
            )}
          </Step>
        </form>

        <aside className="hidden rounded-3xl bg-canvas p-6 shadow-[0_0_0_1px_oklch(var(--line))] lg:sticky lg:top-24 lg:block">
          <h2 className="mb-2 text-lg font-semibold tracking-tight">{en ? "Your order" : "Din ordre"}</h2>
          {summary}
        </aside>
      </div>
      {showTerms && termsNode != null && (
        <TermsDialog
          title={en ? "Terms of sale" : "Kjøpsvilkår"}
          closeLabel={en ? "Close" : "Lukk"}
          acceptLabel={en ? "I accept" : "Jeg godtar"}
          onClose={() => setShowTerms(false)}
          onAccept={() => {
            setTerms(true);
            setShowTerms(false);
          }}
        >
          {termsNode}
        </TermsDialog>
      )}
    </main>
  );
}

/** Kjøpsvilkårene i et vindu over kassen (kunden mister ikke det de har fylt ut). */
function TermsDialog({
  title,
  closeLabel,
  acceptLabel,
  onClose,
  onAccept,
  children,
}: {
  title: string;
  closeLabel: string;
  acceptLabel: string;
  onClose: () => void;
  onAccept: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 80 }}
      className="flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-canvas text-fg shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 id="terms-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>
        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <button type="button" onClick={onClose} className="pill pill-soft">
            {closeLabel}
          </button>
          <button type="button" onClick={onAccept} className="pill pill-primary">
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
