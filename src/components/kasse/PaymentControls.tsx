"use client";

import { RebookPanel } from "@/components/kasse/RebookPanel";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  completeBooking,
  getBookingServiceState,
  getBookingLoyalty,
  listSellableProducts,
  getKasseAllowances,
  getMemberCampaignOffersForBooking,
  getBookingMember,
  type SellableProduct,
  type BookingLoyalty,
  type KasseAllowances,
  type RelationType,
  type MemberCampaignOffer,
} from "@/app/kasse/actions";
import { redeemLoyalty } from "@/app/kasse/kunder/[id]/loyalty-actions";
import { findGiftCard, type GiftCardHit } from "@/app/admin/gavekort/actions";
import { startVippsCharge, pollVippsCharge } from "@/app/kasse/vipps-actions";
import { CouponPicker, couponDiscount } from "@/components/kasse/CouponPicker";
import { ServiceEditor } from "@/components/kasse/ServiceEditor";
import { formatKr } from "@/lib/format";
import { memberDiscountNok, type BookingMember } from "@/lib/member-shared";

const PAYMENTS = ["Kontant", "Kort", "Vipps"];

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted transition-colors focus:border-accent-soft focus:outline-none [@media(pointer:coarse)]:min-h-11";

/** Sammenleggbar seksjon (valgfrie utvidelser i steg 1). */
function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 rounded-lg border border-line bg-canvas p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">
          {title}
          {count && count > 0 ? ` (${count})` : ""}
        </span>
        <button onClick={onToggle} className="act act-accent">
          {open ? "Skjul" : "Endre"}
        </button>
      </div>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

/**
 * Betaling ved fullført time, i to steg (som i bookingen):
 *   Steg 1 «Behandling» – bekreft/endre tjeneste + tillegg, med varer, rabatt
 *     og klippekort som valgfrie utvidelser. Endrer man behandling, oppdateres
 *     selve bookingen (change_booking_service) og totalen hentes på nytt.
 *   Steg 2 «Betaling» – betalingsmåte (enkel eller delt) + kvittering.
 *
 * Registrerer salget via completeBooking (atomisk record_sale). Feiler det,
 * vises feilen og timen forblir åpen – onDone kalles KUN når salget er lagret.
 * Gjenbrukes i dagsliste + kalender.
 */
export function PaymentControls({
  bookingId,
  customerName,
  customerEmail,
  onDone,
}: {
  bookingId: string;
  customerName: string;
  customerEmail: string | null;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  // Etter godkjent betaling: vis «Rebook» før vi lukker.
  const [paid, setPaid] = useState(false);
  // Hvilken betalingsknapp som ble trykket – kun den viser «Registrerer …».
  const [payingMethod, setPayingMethod] = useState<string | null>(null);
  const hasEmail = !!customerEmail;

  // To steg: 1 = behandling, 2 = betaling.
  const [step, setStep] = useState<1 | 2>(1);

  // Åpne kundeinfo automatisk når kunden mangler e-post (så kvittering kan sendes).
  const [showInfo, setShowInfo] = useState(!hasEmail);
  const [name, setName] = useState(
    customerName && customerName !== "—" ? customerName : "",
  );
  const [email, setEmail] = useState(customerEmail ?? "");
  const [phone, setPhone] = useState("");
  const [receipt, setReceipt] = useState(hasEmail);
  const [error, setError] = useState<string | null>(null);

  // Behandling (hentes + kan endres i steg 1)
  const [servicePrice, setServicePrice] = useState<number | null>(null);
  const [serviceName, setServiceName] = useState<string | null>(null);
  const [serviceAddons, setServiceAddons] = useState<string[]>([]);
  const [editingService, setEditingService] = useState(false);

  // Varesalg
  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showProducts, setShowProducts] = useState(false);

  // Rabatt-seksjon (valgfri utvidelse)
  const [showDiscount, setShowDiscount] = useState(false);

  // Klippekort
  const [loyalty, setLoyalty] = useState<BookingLoyalty | null>(null);
  const [redeemed, setRedeemed] = useState(false);
  const [redeeming, startRedeem] = useTransition();

  // Rabatt + splittbetaling
  const [discount, setDiscount] = useState("");
  const [relationType, setRelationType] = useState<RelationType | null>(null);
  const [split, setSplit] = useState(false);
  const [splitAmts, setSplitAmts] = useState<Record<string, string>>({});
  // Gavekort som (del)betaling – samme flyt som i hurtigsalget.
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftCode, setGiftCode] = useState("");
  const [giftHit, setGiftHit] = useState<GiftCardHit | null>(null);
  const [giftMsg, setGiftMsg] = useState<string | null>(null);
  const [giftAmt, setGiftAmt] = useState("");
  const [giftLooking, startGift] = useTransition();

  // Kundeklubb-rabatt fra bookingen (innlogget kunde) – trekkes automatisk.
  const [member, setMember] = useState<BookingMember | null>(null);

  // Medlems-kuponger for bookingens kunde
  const [offers, setOffers] = useState<MemberCampaignOffer[]>([]);
  const [couponId, setCouponId] = useState<string | null>(null);

  // Shop-flagg (rabatt / venn-familie). Eier/admin omgår.
  const [allow, setAllow] = useState<KasseAllowances | null>(null);

  // ---- Vipps-betaling i kassa (push til telefon / QR) ----
  const [vippsOpen, setVippsOpen] = useState(false);
  const [vippsMethod, setVippsMethod] = useState<"push" | "qr">("qr");
  const [vippsPhone, setVippsPhone] = useState("");
  const [vippsRef, setVippsRef] = useState<string | null>(null);
  const [vippsQr, setVippsQr] = useState<string>("");
  const [vippsMode, setVippsMode] = useState<string>("");
  const [vippsState, setVippsState] = useState<
    "idle" | "starting" | "waiting" | "paid" | "failed"
  >("idle");
  const [vippsMsg, setVippsMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getBookingServiceState(bookingId).then((s) => {
      if (!alive) return;
      setServicePrice(s.price);
      setServiceName(s.service);
      setServiceAddons(s.addons);
    });
    listSellableProducts().then((p) => alive && setProducts(p));
    getBookingLoyalty(bookingId).then((l) => alive && setLoyalty(l));
    getKasseAllowances().then((a) => alive && setAllow(a));
    getMemberCampaignOffersForBooking(bookingId).then(
      (o) => alive && setOffers(o),
    );
    getBookingMember(bookingId).then((m) => alive && setMember(m));
    return () => {
      alive = false;
    };
  }, [bookingId]);

  function refreshServiceState() {
    getBookingServiceState(bookingId).then((s) => {
      setServicePrice(s.price);
      setServiceName(s.service);
      setServiceAddons(s.addons);
    });
  }

  function redeem() {
    if (!loyalty) return;
    setError(null);
    startRedeem(async () => {
      const status = await redeemLoyalty(loyalty.customerId);
      if (status === "ok") {
        setRedeemed(true);
        setLoyalty({ ...loyalty, rewardDue: false, progress: 0 });
      } else {
        setError(
          status === "not_ready"
            ? "Ikke nok klipp til å løse inn ennå."
            : status === "forbidden"
              ? "Ingen tilgang til å løse inn."
              : "Kunne ikke løse inn klippekortet. Prøv igjen.",
        );
      }
    });
  }

  const cartLines = useMemo(
    () =>
      products
        .filter((p) => (cart[p.id] ?? 0) > 0)
        .map((p) => ({ ...p, qty: cart[p.id] })),
    [products, cart],
  );
  const productTotal = cartLines.reduce((a, l) => a + l.price_nok * l.qty, 0);
  const gross = (servicePrice ?? 0) + productTotal;
  // Venn/familie-rabatt beregnes LIVE av gross; fri rabatt tas fra feltet.
  const discountNum = relationType
    ? Math.round((gross * (allow?.friendFamilyPct ?? 0)) / 100)
    : Math.max(0, Math.round(Number(discount) || 0));
  // Kupong-rabatt (visning). Serveren beregner det autoritative beløpet.
  const coupon = offers.find((o) => o.id === couponId) ?? null;
  const couponDisc = coupon ? couponDiscount(coupon, gross) : 0;
  // Samme utregning som serveren (lib/member: memberDiscountNok).
  const memberDisc = memberDiscountNok(member, servicePrice ?? 0, productTotal);
  const totalDiscount = Math.min(discountNum + couponDisc + memberDisc, Math.round(gross));
  const total = Math.max(0, Math.round(gross) - totalDiscount);

  // Splittbetaling: beløp per måte, sum, og om det stemmer med totalen.
  const splitEntries = PAYMENTS.map((m) => ({
    method: m,
    amount: Math.max(0, Math.round(Number(splitAmts[m]) || 0)),
  })).filter((e) => e.amount > 0);
  const splitSum = splitEntries.reduce((a, e) => a + e.amount, 0);

  // Gavekort: hvor mye som trekkes og hva som gjenstår å betale.
  const giftUsable = giftHit && !giftHit.expired ? Math.max(0, Math.round(giftHit.balanceNok)) : 0;
  const giftWanted =
    giftAmt.trim() === "" ? Math.min(giftUsable, total) : Math.max(0, Math.round(Number(giftAmt) || 0));
  const giftTake = giftHit ? Math.min(giftWanted, giftUsable, total) : 0;
  const restAfterGift = Math.max(0, total - giftTake);
  const payTarget = giftTake > 0 ? restAfterGift : total;
  const splitOk = splitSum === payTarget && payTarget > 0;
  const giftOpt = giftHit && giftTake > 0 ? { code: giftCode, amount: giftTake } : undefined;

  function lookupGift(code: string) {
    const c = code.trim();
    if (!c) return;
    setGiftMsg(null);
    setGiftHit(null);
    startGift(async () => {
      const hit = await findGiftCard(c);
      if (!hit) {
        setGiftMsg("Fant ikke gavekortet.");
        return;
      }
      if (hit.expired) {
        setGiftMsg("Gavekortet er utløpt.");
        return;
      }
      if (hit.balanceNok <= 0) {
        setGiftMsg("Gavekortet er tomt.");
        return;
      }
      setGiftCode(hit.code);
      setGiftHit(hit);
      setGiftAmt("");
    });
  }
  function clearGift() {
    setGiftHit(null);
    setGiftCode("");
    setGiftAmt("");
    setGiftMsg(null);
  }

  function setQty(id: string, qty: number) {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }

  function pay(method: string) {
    setError(null);
    setPayingMethod(method);
    start(async () => {
      const res = await completeBooking(bookingId, {
        paymentMethod: method,
        customer: showInfo ? { name, email, phone } : undefined,
        sendReceipt: receipt && !!(email.trim() || customerEmail),
        products: cartLines.map((l) => ({ id: l.id, qty: l.qty })),
        discountNok: discountNum,
        campaignId: couponId ?? undefined,
        relationType: relationType ?? undefined,
        gift: giftOpt,
      });
      if (res?.error) {
        setError(res.error);
        return; // timen forblir åpen – ikke lukk
      }
      setPaid(true);
    });
  }

  function paySplit() {
    setError(null);
    if (!splitOk) {
      setError(
        `Betalingen (${formatKr(splitSum)}) må stemme med ${giftTake > 0 ? "resten" : "totalen"} (${formatKr(payTarget)}).`,
      );
      return;
    }
    setPayingMethod("split");
    start(async () => {
      const res = await completeBooking(bookingId, {
        customer: showInfo ? { name, email, phone } : undefined,
        sendReceipt: receipt && !!(email.trim() || customerEmail),
        products: cartLines.map((l) => ({ id: l.id, qty: l.qty })),
        discountNok: discountNum,
        campaignId: couponId ?? undefined,
        relationType: relationType ?? undefined,
        payments: splitEntries,
        gift: giftOpt,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setPaid(true);
    });
  }

  // Felles salgsopplysninger til Vipps-flyten (samme som vanlig betaling).
  function chargeOpts() {
    return {
      products: cartLines.map((l) => ({ id: l.id, qty: l.qty })),
      discountNok: discountNum,
      customer: showInfo ? { name, email, phone } : undefined,
      sendReceipt: receipt && !!(email.trim() || customerEmail),
    };
  }

  function openVipps() {
    // Kupong beregnes server-side i record_sale (med bivirkning), så den kan
    // ikke tas med i et forhånds-Vipps-trekk uten at beløpet spriker. Be heller
    // kassa fjerne kupongen eller bruke en annen betalingsmåte.
    if (couponId) {
      setError(
        "Vipps-trekk støtter ikke medlemskupong. Fjern kupongen, eller ta betalt med en annen måte.",
      );
      return;
    }
    setError(null);
    setVippsMsg(null);
    setVippsState("idle");
    setVippsRef(null);
    setVippsQr("");
    setVippsPhone(phone || "");
    setVippsMethod("qr");
    setVippsOpen(true);
  }

  function cancelVipps() {
    setVippsOpen(false);
    setVippsState("idle");
    setVippsRef(null);
    setVippsQr("");
    setVippsMsg(null);
  }

  async function startVipps() {
    setVippsMsg(null);
    setVippsState("starting");
    const res = await startVippsCharge(bookingId, {
      method: vippsMethod,
      phone: vippsPhone,
      products: chargeOpts().products,
      discountNok: discountNum,
    });
    if (res.error || !res.reference) {
      setVippsState("failed");
      setVippsMsg(res.error ?? "Kunne ikke starte Vipps-betaling.");
      return;
    }
    setVippsRef(res.reference);
    setVippsQr(res.qr ?? "");
    setVippsMode(res.mode ?? "");
    setVippsState("waiting");
  }

  // Polling mens vi venter på at kunden godkjenner i Vipps.
  useEffect(() => {
    if (vippsState !== "waiting" || !vippsRef) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 5 * 60 * 1000; // 5 min
    const opts = chargeOpts();

    async function tick() {
      if (!alive) return;
      const res = await pollVippsCharge(vippsRef!, bookingId, {
        products: opts.products,
        discountNok: opts.discountNok,
        customer: opts.customer,
        sendReceipt: opts.sendReceipt,
      });
      if (!alive) return;
      if (res.status === "paid") {
        setVippsState("paid");
        setPaid(true);
        return;
      }
      if (res.status === "failed") {
        setVippsState("failed");
        setVippsMsg(res.error ?? "Vipps-betalingen ble ikke fullført.");
        return;
      }
      if (Date.now() > deadline) {
        setVippsState("failed");
        setVippsMsg("Tidsavbrudd – kunden godkjente ikke i tide. Prøv igjen.");
        return;
      }
      timer = setTimeout(tick, 2500);
    }
    timer = setTimeout(tick, 3000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vippsState, vippsRef, bookingId]);

  // Liten stegindikator (som i bookingen).
  const stepper = (
    <div className="mb-3 flex items-center gap-2 text-xs text-muted">
      <span className={step === 1 ? "font-semibold text-fg" : ""}>1 · Behandling</span>
      <span className="h-px flex-1 bg-line" />
      <span className={step === 2 ? "font-semibold text-fg" : ""}>2 · Betaling</span>
    </div>
  );

  const totalBox = (
    <div className="mb-3 rounded-lg bg-canvas px-3 py-2">
      {member && memberDisc > 0 && (
        <div className="mb-1.5 flex items-center justify-between gap-2 rounded-md bg-accent-soft/12 px-2 py-1 text-xs">
          <span className="font-semibold text-fg">
            {member.tier}-pris
            <span className="ml-1 font-normal text-muted">
              ({[
                member.servicePct > 0 ? `${member.servicePct} % tjenester` : "",
                member.productPct > 0 ? `${member.productPct} % produkter` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
              )
            </span>
          </span>
          <span className="font-semibold text-fg tabular-nums">−{formatKr(memberDisc)}</span>
        </div>
      )}
      {totalDiscount > 0 && (
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>
            Sum {formatKr(gross)} · rabatt −{formatKr(totalDiscount)}
            {couponDisc > 0 && coupon ? ` (kupong: ${coupon.name})` : ""}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">
          Å betale
        </span>
        <span className="font-display text-lg font-bold text-fg tabular-nums">
          {servicePrice === null ? "…" : formatKr(total)}
        </span>
      </div>
    </div>
  );

  // =================== ETTER BETALING: REBOOK ===================
  if (paid) {
    return <RebookPanel bookingId={bookingId} onClose={onDone} />;
  }

  // =================== STEG 1: BEHANDLING ===================
  if (step === 1) {
    return (
      <div>
        {stepper}

        {/* Behandling (bekreft / endre) */}
        <div className="mb-3 rounded-lg border border-line bg-canvas p-3">
          {editingService ? (
            <ServiceEditor
              bookingId={bookingId}
              initialService={serviceName}
              initialAddons={serviceAddons}
              saveLabel="Lagre behandling"
              onCancel={() => setEditingService(false)}
              onSaved={() => {
                setEditingService(false);
                refreshServiceState();
              }}
            />
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Behandling
                </p>
                <p className="mt-0.5 truncate text-sm font-medium text-fg">
                  {serviceName ?? "—"}
                </p>
                {serviceAddons.length > 0 && (
                  <p className="mt-0.5 truncate text-xs text-muted">
                    + {serviceAddons.join(", ")}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-display text-base font-bold text-fg tabular-nums">
                  {servicePrice === null ? "…" : formatKr(servicePrice)}
                </span>
                <button
                  onClick={() => setEditingService(true)}
                  className="act act-accent"
                >
                  Endre
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Kundeinfo (valgfri) */}
        <Section
          title="Kundeinfo"
          open={showInfo}
          onToggle={() => setShowInfo((v) => !v)}
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Navn"
              className={inputCls}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-post (for kvittering)"
              className={inputCls}
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Telefon"
              className={inputCls}
            />
          </div>
        </Section>

        {/* Varer (valgfri) */}
        {products.length > 0 && (
          <Section
            title="Varer"
            count={cartLines.length}
            open={showProducts}
            onToggle={() => setShowProducts((v) => !v)}
          >
            <div className="max-h-48 space-y-1 overflow-auto">
              {products.map((p) => {
                const qty = cart[p.id] ?? 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-fg">
                      {p.name}
                      <span className="text-muted"> · {formatKr(p.price_nok)}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setQty(p.id, qty - 1)}
                        disabled={qty <= 0}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-lg text-fg hover:bg-surface-2 disabled:opacity-30"
                        aria-label={`Færre ${p.name}`}
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm tabular-nums text-fg">
                        {qty}
                      </span>
                      <button
                        onClick={() => setQty(p.id, qty + 1)}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-lg text-fg hover:bg-surface-2"
                        aria-label={`Flere ${p.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {cartLines.length > 0 && (
              <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs text-muted">
                {cartLines.map((l) => (
                  <li key={l.id} className="flex justify-between">
                    <span>
                      {l.qty}× {l.name}
                    </span>
                    <span className="tabular-nums">{formatKr(l.price_nok * l.qty)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {/* Rabatt (valgfri) */}
        {(allow?.friendFamilyEnabled ||
          allow?.discountAllowed ||
          offers.length > 0) && (
          <Section
            title="Rabatt"
            count={totalDiscount > 0 ? 1 : 0}
            open={showDiscount}
            onToggle={() => setShowDiscount((v) => !v)}
          >
            {allow?.friendFamilyEnabled && (
              <div className="mb-2">
                <p className="mb-1 text-xs text-muted">
                  Venn/familie −{allow.friendFamilyPct}%
                  {relationType && ` = ${formatKr(discountNum)}`}
                </p>
                <div className="flex items-center gap-2">
                  {(["venn", "familie"] as RelationType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setRelationType((cur) => (cur === t ? null : t));
                        setDiscount("");
                      }}
                      className={
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition-colors " +
                        (relationType === t
                          ? "border-accent-soft bg-accent-soft/10 text-fg"
                          : "border-line text-fg hover:border-accent-soft")
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {allow?.discountAllowed && !relationType && (
              <div className="mb-3 flex items-center justify-between gap-2">
                <label className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Rabatt (kr)
                </label>
                <input
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0"
                  inputMode="numeric"
                  aria-label="Rabatt i kroner"
                  className="w-24 rounded-lg border border-line bg-surface px-3 py-1.5 text-right text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none [@media(pointer:coarse)]:min-h-11"
                />
              </div>
            )}
            <CouponPicker
              offers={offers}
              selectedId={couponId}
              onSelect={setCouponId}
              gross={gross}
            />
          </Section>
        )}

        {/* Klippekort (info – alltid synlig når relevant) */}
        {loyalty && (
          <div className="mb-3 rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
            {redeemed ? (
              <span className="font-semibold text-accent-soft">
                Gratis klipp løst inn ✓ — telleren er nullstilt.
              </span>
            ) : loyalty.rewardDue ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-accent-soft">
                  Gratis klipp opptjent! 🎉
                </span>
                <button
                  type="button"
                  onClick={redeem}
                  disabled={redeeming}
                  className="rounded-lg bg-accent-soft px-3 py-1.5 font-semibold text-[#211E1A] transition-opacity hover:opacity-90 disabled:opacity-60 [@media(pointer:coarse)]:min-h-11"
                >
                  {redeeming ? "Løser inn …" : "Løs inn gratis klipp"}
                </button>
              </div>
            ) : (
              <span className="text-muted">
                Klippekort: {loyalty.progress} / {loyalty.required} klipp
              </span>
            )}
          </div>
        )}

        {totalBox}

        {error && (
          <p className="mb-3 rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger">
            {error}
          </p>
        )}

        <button
          onClick={() => {
            setError(null);
            setStep(2);
          }}
          disabled={servicePrice === null || editingService}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
        >
          Til betaling →
        </button>
      </div>
    );
  }

  // =================== STEG 2: BETALING ===================
  return (
    <div>
      {stepper}

      {totalBox}

      <label className="mb-3 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={receipt}
          onChange={(e) => setReceipt(e.target.checked)}
        />
        Send kvittering på e-post
      </label>

      {error && (
        <p className="mb-3 rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </p>
      )}

      {/* Gavekort (hel eller delvis betaling) */}
      <div className="mb-3 rounded-xl border border-line p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-muted uppercase">Gavekort</span>
          {giftHit ? (
            <button type="button" onClick={clearGift} disabled={pending} className="act act-danger">
              Fjern
            </button>
          ) : (
            <button type="button" onClick={() => setGiftOpen((v) => !v)} className="act act-accent">
              {giftOpen ? "Skjul" : "Betal med gavekort"}
            </button>
          )}
        </div>
        {giftOpen && !giftHit && (
          <div className="mt-2">
            <div className="flex gap-2">
              <input
                value={giftCode}
                onChange={(e) => setGiftCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lookupGift(giftCode);
                  }
                }}
                placeholder="Skann eller skriv kode …"
                aria-label="Gavekortkode"
                autoComplete="off"
                autoFocus
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => lookupGift(giftCode)}
                disabled={giftLooking || !giftCode.trim()}
                className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm text-fg hover:border-accent-soft disabled:opacity-40 [@media(pointer:coarse)]:min-h-11"
              >
                {giftLooking ? "…" : "Slå opp"}
              </button>
            </div>
            {giftMsg && (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {giftMsg}
              </p>
            )}
          </div>
        )}
        {giftHit && (
          <div className="mt-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted tabular-nums">
                {giftHit.code} · saldo {formatKr(giftHit.balanceNok)}
              </span>
              <label className="flex items-center gap-2 text-xs text-muted">
                Trekk
                <input
                  value={giftAmt}
                  onChange={(e) => setGiftAmt(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={String(Math.min(giftUsable, total))}
                  inputMode="numeric"
                  aria-label="Beløp fra gavekort"
                  className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm text-fg tabular-nums outline-none focus:border-accent-soft [@media(pointer:coarse)]:min-h-11"
                />
                kr
              </label>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 tabular-nums">
              <span className="text-xs text-muted">
                Gavekort dekker {formatKr(giftTake)} · ny saldo {formatKr(giftHit.balanceNok - giftTake)}
              </span>
              <span className="text-xs font-semibold text-fg">Rest: {formatKr(restAfterGift)}</span>
            </div>
          </div>
        )}
      </div>

      {giftTake > 0 && restAfterGift === 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => pay("Gavekort")}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
        >
          {pending && payingMethod === "Gavekort" ? "Registrerer …" : `Fullfør – ${formatKr(giftTake)} fra gavekortet`}
        </button>
      ) : (
      <>
      {/* Betaling: enkel eller delt */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted">
          {split
            ? giftTake > 0
              ? "Del resten på flere måter:"
              : "Del betalingen på flere måter:"
            : giftTake > 0
              ? "Resten betalt med:"
              : "Betalt med:"}
        </span>
        <button
          type="button"
          onClick={() => {
            setSplit((v) => !v);
            setError(null);
          }}
          className="act act-accent"
        >
          {split ? "Enkel betaling" : "Del betaling"}
        </button>
      </div>

      {split ? (
        <div className="space-y-2">
          {PAYMENTS.map((m) => (
            <div key={m} className="flex items-center justify-between gap-2">
              <span className="text-sm text-fg">{m}</span>
              <input
                value={splitAmts[m] ?? ""}
                onChange={(e) =>
                  setSplitAmts((s) => ({
                    ...s,
                    [m]: e.target.value.replace(/[^0-9]/g, ""),
                  }))
                }
                placeholder="0"
                inputMode="numeric"
                aria-label={`Beløp ${m}`}
                className="w-28 rounded-lg border border-line bg-surface px-3 py-1.5 text-right text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none [@media(pointer:coarse)]:min-h-11"
              />
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-line pt-2 text-xs">
            <span className={splitOk ? "text-accent-soft" : "text-muted"}>
              Fordelt: {formatKr(splitSum)} / {formatKr(payTarget)}
              {splitSum !== payTarget &&
                ` · ${splitSum > payTarget ? "−" : "mangler "}${formatKr(Math.abs(payTarget - splitSum))}`}
            </span>
            <button
              type="button"
              disabled={pending || !splitOk}
              onClick={paySplit}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40 [@media(pointer:coarse)]:min-h-11"
            >
              {pending && payingMethod === "split" ? "Registrerer …" : "Registrer betaling"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {PAYMENTS.map((p) =>
            p === "Vipps" ? (
              <button
                key={p}
                disabled={pending || giftTake > 0}
                onClick={openVipps}
                className="rounded-lg bg-[#ff5b24] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
              >
                Vipps
              </button>
            ) : (
              <button
                key={p}
                disabled={pending}
                onClick={() => pay(p)}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
              >
                {pending && payingMethod === p ? "Registrerer …" : p}
              </button>
            ),
          )}
        </div>
      )}
      {giftTake > 0 && !split && (
        <p className="mt-2 text-xs text-muted">
          Vipps-trekk i appen kan ikke kombineres med gavekort – ta resten med kort eller kontant.
        </p>
      )}
      </>
      )}

      {/* ---- Vipps-betalingspanel (push til telefon / QR) ---- */}
      {vippsOpen && (
        <div className="mt-3 rounded-lg border border-[#ff5b24]/40 bg-[#ff5b24]/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide text-[#c7401a] uppercase">
              Vipps · {formatKr(total)}
            </span>
            <button onClick={cancelVipps} className="act" type="button">
              Lukk
            </button>
          </div>

          {vippsState === "waiting" ? (
            <div className="text-center">
              {vippsMethod === "qr" && vippsQr ? (
                <>
                  <p className="mb-2 text-xs text-muted">
                    Be kunden skanne QR-koden med Vipps-appen.
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={vippsQr}
                    alt="Vipps QR"
                    className="mx-auto h-48 w-48 rounded-lg border border-line bg-white p-2"
                  />
                </>
              ) : (
                <p className="py-4 text-sm text-fg">
                  Betalingsforespørsel sendt til <b>{vippsPhone}</b>. Be kunden
                  godkjenne i Vipps-appen.
                </p>
              )}
              <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#ff5b24]" />
                Venter på betaling …
              </p>
              {vippsMode === "mock" && (
                <p className="mt-1 text-[11px] text-muted">
                  (Mock-modus – ingen ekte penger. Fullføres automatisk.)
                </p>
              )}
              <button
                onClick={cancelVipps}
                type="button"
                className="mt-3 rounded-lg border border-line px-4 py-1.5 text-xs font-semibold text-muted hover:border-accent-soft hover:text-fg [@media(pointer:coarse)]:min-h-11"
              >
                Avbryt
              </button>
            </div>
          ) : (
            <>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setVippsMethod("qr")}
                  className={
                    "flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors " +
                    (vippsMethod === "qr"
                      ? "border-[#ff5b24] bg-[#ff5b24]/10 text-fg"
                      : "border-line text-muted hover:border-accent-soft")
                  }
                >
                  QR på skjerm
                </button>
                <button
                  type="button"
                  onClick={() => setVippsMethod("push")}
                  className={
                    "flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors " +
                    (vippsMethod === "push"
                      ? "border-[#ff5b24] bg-[#ff5b24]/10 text-fg"
                      : "border-line text-muted hover:border-accent-soft")
                  }
                >
                  Push til telefon
                </button>
              </div>

              {vippsMethod === "push" && (
                <input
                  value={vippsPhone}
                  onChange={(e) =>
                    setVippsPhone(e.target.value.replace(/[^0-9+]/g, ""))
                  }
                  placeholder="Kundens mobilnummer"
                  inputMode="tel"
                  className={inputCls + " mb-2"}
                />
              )}

              {vippsMsg && vippsState === "failed" && (
                <p className="mb-2 rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger">
                  {vippsMsg}
                </p>
              )}

              <button
                type="button"
                onClick={startVipps}
                disabled={vippsState === "starting"}
                className="w-full rounded-lg bg-[#ff5b24] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
              >
                {vippsState === "starting"
                  ? "Starter …"
                  : vippsMethod === "qr"
                    ? "Vis QR-kode"
                    : "Send til telefon"}
              </button>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => {
          setError(null);
          setStep(1);
        }}
        disabled={pending}
        className="act mt-3"
      >
        ← Tilbake
      </button>
    </div>
  );
}
