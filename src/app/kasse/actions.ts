"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendBookingConfirmationSms } from "@/lib/sms-booking";
import {
  bookingCustomerLang,
  customerLangByEmail,
  payMethodLang,
  translateServiceText,
  type Lang,
} from "@/lib/i18n/server-lang";
import { createServiceClient } from "@/lib/supabase/service";
import { osloToUtcISO } from "@/lib/oslo-time";
import { getUserRole, isAdminRole, requireRole } from "@/lib/auth";
import { getLoyaltyStatus } from "@/lib/loyalty-queries";
import { getShopContext } from "@/lib/shop-settings";

/** Venn/familie-salgstype (0054). Tagges på salget for bruk/hyppighet. */
export type RelationType = "venn" | "familie";
import {
  sendBookingConfirmation,
  sendReceiptEmail,
  sendNoShowEmail,
} from "@/lib/email";

/**
 * Hva kassa har lov til, ut fra shop-flagg + rolle. Eier/admin omgår alt.
 * Brukes av kasse-UI-en for å vise/skjule rabatt, venn/familie-knapp og
 * drop-in-uten-kunde. Håndheves også server-side i completeBooking /
 * recordWalkinSale (dette er kun for UX).
 */
export type KasseAllowances = {
  discountAllowed: boolean;
  friendFamilyEnabled: boolean;
  friendFamilyPct: number;
  dropinWithoutCustomerAllowed: boolean;
  canBypass: boolean;
};

export async function getKasseAllowances(): Promise<KasseAllowances> {
  await requireRole(["shop", "admin"]);
  const { flags, canBypass } = await getShopContext();
  return {
    discountAllowed: canBypass || flags.discount_enabled,
    friendFamilyEnabled: canBypass || flags.friend_family_discount_enabled,
    friendFamilyPct: flags.friend_family_discount_pct,
    dropinWithoutCustomerAllowed:
      canBypass || flags.dropin_without_customer_enabled,
    canBypass,
  };
}


/** Valgbar medlems-kupong i kassa (fra member_campaign_offers). */
export type MemberCampaignOffer = {
  id: string;
  name: string;
  description: string | null;
  discountType: "percent" | "fixed";
  discountValue: number;
  expiresAt: string | null;
};

type OfferRow = {
  id: string;
  name: string;
  description: string | null;
  discount_type: string;
  discount_value: number | string;
  expires_at: string | null;
};

function mapOffers(data: unknown): MemberCampaignOffer[] {
  const rows = (Array.isArray(data) ? data : []) as OfferRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    discountType: r.discount_type === "percent" ? "percent" : "fixed",
    discountValue: Number(r.discount_value) || 0,
    expiresAt: r.expires_at ?? null,
  }));
}

/** Gyldige kuponger for en kunde-id (til hurtigsalg med valgt kunde). */
export async function getMemberCampaignOffers(
  customerId: string,
): Promise<MemberCampaignOffer[]> {
  await requireRole(["shop", "admin"]);
  if (!customerId) return [];
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("member_campaign_offers", { p_customer: customerId });
    return mapOffers(data);
  } catch {
    return [];
  }
}

/** Gyldige kuponger for kunden på en booking (kunde-id slås opp server-side). */
export async function getMemberCampaignOffersForBooking(
  bookingId: string,
): Promise<MemberCampaignOffer[]> {
  await requireRole(["shop", "admin"]);
  if (!bookingId) return [];
  try {
    const sb = await createClient();
    const { data: b } = await sb
      .from("bookings")
      .select("customer_id")
      .eq("id", bookingId)
      .maybeSingle();
    const customerId = b?.customer_id as string | null;
    if (!customerId) return [];
    const { data } = await sb.rpc("member_campaign_offers", { p_customer: customerId });
    return mapOffers(data);
  } catch {
    return [];
  }
}

function refresh() {
  revalidatePath("/kasse");
  revalidatePath("/kasse/kalender");
}

function fmtDay(iso: string, lang: Lang = "no") {
  try {
    return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "nb-NO", {
      // Serveren kjører i UTC – uten Oslo-tidssone havner dato/tid feil
      // (i e-post m.m.). Europe/Oslo gir riktig norsk dag.
      timeZone: "Europe/Oslo",
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  } catch {
    return iso;
  }
}
function fmtClock(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("nb-NO", {
      // Viktig: uten Europe/Oslo formateres den lagrede UTC-tiden i UTC, så
      // 17:00 Oslo (lagret 15:00 UTC) ble vist som «15:00» i bekreftelsen.
      timeZone: "Europe/Oslo",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Produktlinje ved betaling (voks/sjampo o.l.). Pris hentes server-side. */
export type SaleProduct = { id: string; qty: number };

export type SplitPayment = { method: string; amount: number };

export type CompleteOptions = {
  paymentMethod?: string;
  /** Venn/familie-salg (tagges på salget). */
  relationType?: RelationType;
  /** Kundeinfo som fylles inn ved betaling (drop-in) – lagres i CRM. */
  customer?: { name?: string; email?: string; phone?: string };
  /** Send kvittering på e-post. */
  sendReceipt?: boolean;
  /** Produkter som selges sammen med timen (varesalg over disk). */
  products?: SaleProduct[];
  /** Rabatt i kr trukket fra totalen (kampanje/kulanse). Server klemmer til [0, brutto]. */
  discountNok?: number;
  /** Valgt medlems-kupong. Rabatten beregnes + valideres server-side (record_sale). */
  campaignId?: string;
  /** Splittbetaling: beløp per betalingsmåte. Utelates ved enkeltbetaling. */
  payments?: SplitPayment[];
};

export type CompleteResult = { ok?: true; error?: string };

/**
 * Hent faktiske salgstall for en booking til kvitteringen: netto total,
 * rabatt og betalingsfordeling (splitt). Best-effort – feiler stille.
 */
async function receiptExtras(
  sb: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
): Promise<{
  totalNok: number | null;
  discountNok: number;
  payments: { method: string; amount: number }[];
}> {
  try {
    const { data: sale } = await sb
      .from("sales")
      .select("id, total_nok, discount_nok")
      .eq("booking_id", bookingId)
      .order("sold_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sale) return { totalNok: null, discountNok: 0, payments: [] };
    const { data: pays } = await sb
      .from("sale_payments")
      .select("method, amount")
      .eq("sale_id", sale.id);
    return {
      totalNok: Number(sale.total_nok) || 0,
      discountNok: Number(sale.discount_nok) || 0,
      payments: ((pays ?? []) as { method: string; amount: number }[]).map(
        (p) => ({ method: p.method, amount: Number(p.amount) || 0 }),
      ),
    };
  } catch {
    return { totalNok: null, discountNok: 0, payments: [] };
  }
}

/**
 * Fullfør en time: registrer salget (tjeneste + evt. produkter) atomisk,
 * oppdater evt. kundeinfo i CRM (drop-in), og send kvittering hvis ønsket.
 *
 * VIKTIG: selve salget skrives via record_sale-RPC-en (én transaksjon:
 * sale + sale_items + lager + status). Feiler den, markeres IKKE timen
 * fullført, og feilen returneres slik at kassen kan vise den – i stedet
 * for at et salg forsvinner uten spor (jf. live-test 19. sept).
 */

/* ---------- Etterregistrering: salget telles på riktig dag ---------- */

/** yyyy-mm-dd i Oslo-tid. */
function osloDay(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });
}

/**
 * Flytt et salg til dagen det faktisk skjedde (sold_at). Brukes når et salg
 * registreres i etterkant, så det havner i riktig dags oppgjør og rapporter
 * og ikke på dagen det ble tastet inn. Service-rolle fordi sales bare har
 * admin-RLS. Best-effort: feiler stille (salget står da på i dag).
 */
async function backdateSale(saleId: unknown, soldAtIso: string): Promise<void> {
  if (typeof saleId !== "string") return;
  try {
    await createServiceClient().from("sales").update({ sold_at: soldAtIso }).eq("id", saleId);
  } catch {
    // best-effort
  }
}

export async function completeBooking(
  bookingId: string,
  opts?: CompleteOptions | string,
): Promise<CompleteResult> {
  await requireRole(["shop", "admin"]);
  // Bakoverkompatibelt: tidligere signatur var (id, paymentMethod: string).
  const o: CompleteOptions =
    typeof opts === "string" ? { paymentMethod: opts } : (opts ?? {});

  const sb = await createClient();

  // Rabatt-flagg (type-bevisst): venn/familie-rabatt krever at venn/familie er
  // på; fri rabatt krever at fri rabatt er på. Eier/admin omgår. Blokkeres her
  // før noe registreres.
  const { flags: sflags, canBypass: sBypass } = await getShopContext();
  const ffEnabled = sBypass || sflags.friend_family_discount_enabled;
  const freeEnabled = sBypass || sflags.discount_enabled;
  const discountNok = Math.max(0, Math.round(o.discountNok ?? 0));
  if (discountNok > 0) {
    const ok = o.relationType ? ffEnabled : freeEnabled;
    if (!ok) {
      return {
        error: o.relationType
          ? "Venn/familie-rabatt er slått av for kassa."
          : "Rabatt er slått av for kassa.",
      };
    }
  }

  // Booking-info til CRM/kvittering (leses før salget registreres).
  const { data: b } = await sb
    .from("bookings")
    .select(
      "customer_id, price_nok, start_at, services(name), staff(full_name)",
    )
    .eq("id", bookingId)
    .maybeSingle();

  // Drop-in: timen har ingen kunde. Fyller kassereren inn kundeinfo ved
  // betaling, OPPRETTER vi kundebildet her (eller gjenbruker en eksisterende
  // match på e-post/telefon) og knytter det til timen FØR salget registreres,
  // så salget havner på riktig kunde. Uten info forblir timen anonym.
  const dinfo = o.customer;
  const dropHasInfo =
    !!dinfo &&
    !!(dinfo.name?.trim() || dinfo.email?.trim() || dinfo.phone?.trim());
  if (!b?.customer_id && dropHasInfo) {
    const em = dinfo!.email?.trim().toLowerCase() || null;
    const ph = dinfo!.phone?.trim() || null;
    let cid: string | null = null;
    if (em) {
      const { data } = await sb
        .from("customers")
        .select("id")
        .ilike("email", em)
        .limit(1)
        .maybeSingle();
      cid = (data?.id as string) ?? null;
    }
    if (!cid && ph) {
      const { data } = await sb
        .from("customers")
        .select("id")
        .eq("phone", ph)
        .limit(1)
        .maybeSingle();
      cid = (data?.id as string) ?? null;
    }
    if (!cid) {
      const { data } = await sb
        .from("customers")
        .insert({
          full_name: dinfo!.name?.trim() || "Kunde",
          email: em,
          phone: ph,
        })
        .select("id")
        .maybeSingle();
      cid = (data?.id as string) ?? null;
    }
    if (cid) {
      await sb.from("bookings").update({ customer_id: cid }).eq("id", bookingId);
      if (b) (b as { customer_id?: string | null }).customer_id = cid;
    }
  }

  // Registrer salget atomisk. Prisene settes server-side (booking + products).
  const products = (o.products ?? [])
    .filter((p) => p && p.id)
    .map((p) => ({ id: p.id, qty: Math.max(1, Math.floor(p.qty || 1)) }));
  const payments = (o.payments ?? [])
    .filter((p) => p && p.method && (p.amount ?? 0) > 0)
    .map((p) => ({ method: p.method, amount: Math.round(p.amount) }));
  const { data: saleId, error: saleErr } = await sb.rpc("record_sale", {
    p_booking: bookingId,
    p_payment_method: o.paymentMethod ?? null,
    p_products: products,
    p_discount: discountNok,
    p_payments: payments.length > 0 ? payments : null,
    p_campaign: o.campaignId || null,
  });
  if (saleErr) {
    return {
      error:
        saleErr.message ||
        "Salget ble ikke registrert. Ingenting er lagret – prøv igjen.",
    };
  }

  // Timen var en tidligere dag (f.eks. lørdag, betalt inn mandag): salget
  // skal telles på timens dag – ikke på dagen det ble registrert.
  const startAt = (b as { start_at?: string | null } | null)?.start_at;
  if (startAt && osloDay(startAt) < osloDay(new Date())) {
    await backdateSale(saleId, startAt);
  }

  // --- Alt under er best-effort. Salget er allerede trygt registrert. ---

  // Venn/familie-tag på salget (0054) – kun når venn/familie er på (unngå at
  // en manipulert forespørsel forurenser rapporten). Service-rolle fordi sales
  // bare har admin-RLS (shop skriver via SECURITY DEFINER).
  if (o.relationType && ffEnabled && typeof saleId === "string") {
    try {
      await createServiceClient()
        .from("sales")
        .update({ relation_type: o.relationType })
        .eq("id", saleId);
    } catch {
      // best-effort – påvirker ikke salget
    }
  }

  // Legg inn / oppdater kundeinfo i CRM (typisk for drop-in ved betaling).
  const info = o.customer;
  if (
    b?.customer_id &&
    info &&
    (info.name?.trim() || info.email?.trim() || info.phone?.trim())
  ) {
    const patch: Record<string, string> = {};
    if (info.name?.trim()) patch.full_name = info.name.trim();
    if (info.email?.trim()) patch.email = info.email.trim();
    if (info.phone?.trim()) patch.phone = info.phone.trim();
    await sb.from("customers").update(patch).eq("id", b.customer_id);
  }

  // Kvittering på e-post (degraderer stille – ikke en del av salgsintegriteten).
  if (o.sendReceipt && b) {
    let email = info?.email?.trim();
    let name = info?.name?.trim();
    if ((!email || !name) && b.customer_id) {
      const { data: c } = await sb
        .from("customers")
        .select("full_name, email")
        .eq("id", b.customer_id)
        .maybeSingle();
      email = email || (c?.email ?? undefined);
      name = name || (c?.full_name ?? "");
    }
    if (email) {
      const s = b.services as { name?: string } | null;
      const st = b.staff as { full_name?: string } | null;
      const extras = await receiptExtras(sb, bookingId);
      const lang = await bookingCustomerLang(sb, bookingId);
      await sendReceiptEmail({
        to: email,
        name: name ?? "",
        service: await translateServiceText(s?.name ?? "", lang),
        barber: st?.full_name ?? "",
        date: fmtDay(b.start_at, lang),
        price: `${extras.totalNok ?? b.price_nok} kr`,
        paymentMethod: o.paymentMethod ? payMethodLang(o.paymentMethod, lang) : undefined,
        discount: extras.discountNok,
        payments: extras.payments?.map((p) => ({ ...p, method: payMethodLang(p.method, lang) })),
        lang,
      });
    }
  }

  refresh();
  return { ok: true };
}

/**
 * Angre en fullført / ikke-møtt time (feiltrykk på nettbrettet). Sletter
 * salget, tilbakefører produktlager og setter timen tilbake til bekreftet.
 */
export async function reopenBooking(
  bookingId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  try {
    const sb = await createClient();

    // Ingen skjuling av no-show: en «ikke møtt» som har passert kan ikke angres
    // av kasse (det ville fjerne no-show fra rapporten). Eier/admin kan overstyre.
    // Angre et FULLFØRT salg (feiltrykk) er fortsatt lov for kasse.
    const { data: b } = await sb
      .from("bookings")
      .select("status, start_at, customer_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (
      b?.status === "no_show" &&
      b?.customer_id &&
      new Date(b.start_at as string).getTime() < Date.now()
    ) {
      const me = await getUserRole();
      if (!isAdminRole(me?.role)) {
        return {
          error: "En passert «ikke møtt» kan bare angres av eier/admin.",
        };
      }
    }

    const { error } = await sb.rpc("reopen_booking", { p_booking: bookingId });
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  } catch {
    return { error: "Kunne ikke angre. Prøv igjen." };
  }
}

export type BarcodeProduct = {
  id: string;
  name: string;
  price_nok: number;
  stock: number;
  is_gift_card: boolean;
};

/** Slår opp et aktivt produkt på strekkode (via RPC – funker for shop + admin). */
export async function findProductByBarcode(
  code: string,
): Promise<BarcodeProduct | null> {
  await requireRole(["shop", "admin"]);
  const c = code.trim();
  if (!c) return null;
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("find_product_by_barcode", { p_code: c });
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          id: string;
          name: string;
          price_nok: number;
          stock: number;
          is_gift_card: boolean;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      price_nok: Number(row.price_nok) || 0,
      stock: Number(row.stock) || 0,
      is_gift_card: !!row.is_gift_card,
    };
  } catch {
    return null;
  }
}

export type SellableProduct = { id: string; name: string; price_nok: number };

/** Produkter som kan selges over disk i kassen (aktive, ikke gavekort). */
export async function listSellableProducts(): Promise<SellableProduct[]> {
  await requireRole(["shop", "admin"]);
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("products")
      .select("id, name, price_nok, is_gift_card, active")
      .eq("active", true)
      .eq("is_gift_card", false)
      .order("name");
    return ((data as SellableProduct[]) ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      price_nok: Number(p.price_nok) || 0,
    }));
  } catch {
    return [];
  }
}

export type SellableService = { name: string; price_nok: number; category?: string };

/** Aktive behandlinger som kan selges i kassen (med pris). */
export async function listSellableServices(): Promise<SellableService[]> {
  await requireRole(["shop", "admin"]);
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("services")
      .select("name, price_nok, active, sort_order, service_categories(name, sort_order)")
      .eq("active", true);
    const rows = ((data ?? []) as unknown as {
      name: string;
      price_nok: number;
      sort_order: number | null;
      service_categories: { name?: string; sort_order?: number } | null;
    }[]).map((s) => ({
      name: s.name,
      price_nok: Number(s.price_nok) || 0,
      category: s.service_categories?.name ?? "Annet",
      catSort: s.service_categories?.sort_order ?? 0,
      svcSort: s.sort_order ?? 0,
    }));
    // Samme rekkefølge som forsiden/kalenderen: kategori først, «Tillegg» sist.
    const isAddon = (c: string) => c.trim().toLowerCase() === "tillegg";
    rows.sort(
      (a, b) =>
        Number(isAddon(a.category)) - Number(isAddon(b.category)) ||
        a.catSort - b.catSort ||
        a.category.localeCompare(b.category) ||
        a.svcSort - b.svcSort ||
        a.name.localeCompare(b.name),
    );
    return rows.map(({ name, price_nok, category }) => ({ name, price_nok, category }));
  } catch {
    return [];
  }
}

export type GiftCardPayment = {
  /** Gavekort-kode eller strekkode. */
  code: string;
  /** Ønsket trekk i kr. Utelatt = så mye som mulig (saldo / hele beløpet). */
  amount?: number;
};

export type WalkinInput = {
  staffId?: string;
  /** Salgsdato (yyyy-mm-dd) ved etterregistrering. Utelatt/i dag = nå. */
  soldDate?: string;
  paymentMethod: string;
  /** Hovedbehandling (bakoverkompatibel – brukes hvis `services` mangler). */
  service?: string;
  /** Alle behandlingslinjer: hovedbehandling + tillegg (navn). */
  services?: string[];
  /** Betal (helt/delvis) med gavekort. Resten tas med paymentMethod/payments. */
  gift?: GiftCardPayment;
  products?: SaleProduct[];
  customer?: { name?: string; email?: string; phone?: string };
  /** Valgt eksisterende kunde (fra telefonsøk). Knytter salget til denne raden.
   *  Kontaktinfoen slås opp server-side, så telefonnr aldri må til nettleseren. */
  customerId?: string;
  /** Venn/familie-salg (tagges på salget). */
  relationType?: RelationType;
  makeMember?: boolean;
  /** Rabatt i kr trukket fra totalen. Server klemmer til [0, brutto]. */
  discountNok?: number;
  /** Valgt medlems-kupong. Rabatten beregnes + valideres server-side. */
  campaignId?: string;
  /** Splittbetaling: beløp per betalingsmåte. Utelates ved enkeltbetaling. */
  payments?: SplitPayment[];
  /** Send kvittering på e-post (krever at kunde-e-post er fylt inn). */
  sendReceipt?: boolean;
};

/**
 * Hurtigsalg / drop-in uten booking: behandling og/eller varer over disk,
 * med valgfri kundeinfo (lagres i kartoteket) og valgfritt medlemskap
 * (samtykke). Priser settes server-side i record_walkin_sale.
 */
export async function recordWalkinSale(
  input: WalkinInput,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  try {
    const sb = await createClient();
    const products = (input.products ?? [])
      .filter((p) => p && p.id)
      .map((p) => ({ id: p.id, qty: Math.max(1, Math.floor(p.qty || 1)) }));
    const c = input.customer;
    let customer =
      c && (c.name?.trim() || c.email?.trim() || c.phone?.trim())
        ? {
            name: c.name?.trim() || null,
            email: c.email?.trim() || null,
            phone: c.phone?.trim() || null,
          }
        : null;

    // «Kunde før betaling»: en valgt eksisterende kunde slås opp server-side
    // (service-role) og brukes som match-nøkkel, så record_walkin_sale knytter
    // salget til nøyaktig den raden. Telefonnr forlater aldri serveren.
    if (input.customerId) {
      try {
        const svc = createServiceClient();
        const { data: existing } = await svc
          .from("customers")
          .select("full_name, email, phone")
          .eq("id", input.customerId)
          .maybeSingle();
        if (existing) {
          customer = {
            name: (existing.full_name as string) || customer?.name || null,
            email: (existing.email as string) || null,
            phone: (existing.phone as string) || null,
          };
        }
      } catch {
        // faller tilbake til det som ble skrevet inn manuelt
      }
    }
    const payments = (input.payments ?? [])
      .filter((p) => p && p.method && (p.amount ?? 0) > 0)
      .map((p) => ({ method: p.method, amount: Math.round(p.amount) }));

    // Shop-flagg (håndheves server-side; eier/admin omgår). Type-bevisst rabatt.
    const { flags, canBypass } = await getShopContext();
    const ffEnabled = canBypass || flags.friend_family_discount_enabled;
    const freeEnabled = canBypass || flags.discount_enabled;
    const discountNok = Math.max(0, Math.round(input.discountNok ?? 0));
    if (discountNok > 0) {
      const ok = input.relationType ? ffEnabled : freeEnabled;
      if (!ok) {
        return {
          error: input.relationType
            ? "Venn/familie-rabatt er slått av for kassa."
            : "Rabatt er slått av for kassa.",
        };
      }
    }
    if (!customer && !(canBypass || flags.dropin_without_customer_enabled)) {
      return { error: "Registrer kunde – drop-in uten kunde er slått av." };
    }

    // Behandlingslinjer: eksplisitt liste, ellers den gamle enkelt-tjenesten.
    const serviceNames = (
      input.services && input.services.length > 0
        ? input.services
        : input.service
          ? [input.service]
          : []
    )
      .map((s) => s.trim())
      .filter(Boolean);
    const giftCode = input.gift?.code?.trim() || null;
    const giftAmount =
      input.gift && typeof input.gift.amount === "number" && input.gift.amount > 0
        ? Math.round(input.gift.amount)
        : null;

    const { data: saleId, error } = await sb.rpc("record_walkin_sale_v2", {
      p_staff: input.staffId || null,
      p_payment_method: input.paymentMethod ?? null,
      p_services: serviceNames,
      p_products: products,
      p_customer: customer,
      p_make_member: !!input.makeMember,
      p_discount: discountNok,
      p_payments: payments.length > 0 ? payments : null,
      p_campaign: input.campaignId || null,
      p_gift_code: giftCode,
      p_gift_amount: giftAmount,
    });
    if (error) {
      return {
        error: error.message || "Salget ble ikke registrert. Prøv igjen.",
      };
    }

    // Etterregistrert hurtigsalg: legg salget på valgt dag (midt på dagen).
    const sd = input.soldDate?.trim();
    if (sd && /^\d{4}-\d{2}-\d{2}$/.test(sd) && sd < osloDay(new Date())) {
      await backdateSale(saleId, `${sd}T11:00:00.000Z`);
    }

    // Venn/familie-tag på salget (0054) – kun når venn/familie er på. Service-
    // rolle fordi sales bare har admin-RLS (shop skriver via SECURITY DEFINER).
    if (input.relationType && ffEnabled && typeof saleId === "string") {
      try {
        await createServiceClient()
          .from("sales")
          .update({ relation_type: input.relationType })
          .eq("id", saleId);
      } catch {
        // best-effort
      }
    }

    // Kvittering (best-effort – salget er allerede trygt registrert).
    const receiptEmail = customer?.email;
    if (input.sendReceipt && receiptEmail && typeof saleId === "string") {
      try {
        const { data: sale } = await sb
          .from("sales")
          .select("total_nok, discount_nok")
          .eq("id", saleId)
          .maybeSingle();
        const { data: pays } = await sb
          .from("sale_payments")
          .select("method, amount")
          .eq("sale_id", saleId);
        let barberName = "";
        if (input.staffId) {
          const { data: st } = await sb
            .from("staff")
            .select("full_name")
            .eq("id", input.staffId)
            .maybeSingle();
          barberName = st?.full_name ?? "";
        }
        const lang = await customerLangByEmail(sb, receiptEmail);
        await sendReceiptEmail({
          to: receiptEmail,
          name: customer?.name ?? "",
          service:
            serviceNames.length > 0
              ? await translateServiceText(serviceNames.join(" + "), lang)
              : lang === "en" ? "Products" : "Varekjøp",
          barber: barberName,
          date: fmtDay(new Date().toISOString(), lang),
          price: `${Number(sale?.total_nok) || 0} kr`,
          paymentMethod: input.paymentMethod ? payMethodLang(input.paymentMethod, lang) : undefined,
          discount: Number(sale?.discount_nok) || 0,
          payments: ((pays ?? []) as { method: string; amount: number }[]).map(
            (p) => ({ method: payMethodLang(p.method, lang), amount: Number(p.amount) || 0 }),
          ),
          lang,
        });
      } catch {
        // kvittering feiler stille – påvirker ikke salget
      }
    }

    refresh();
    return { ok: true };
  } catch {
    return { error: "Noe gikk galt. Prøv igjen." };
  }
}

export type BookingLoyalty = {
  customerId: string;
  progress: number;
  required: number;
  rewardDue: boolean;
};

/** Klippekort-status for bookingens kunde (til betalingsflyten). */
export async function getBookingLoyalty(
  bookingId: string,
): Promise<BookingLoyalty | null> {
  await requireRole(["shop", "admin"]);
  try {
    const sb = await createClient();
    const { data: b } = await sb
      .from("bookings")
      .select("customer_id")
      .eq("id", bookingId)
      .maybeSingle();
    const cid = (b?.customer_id as string | null | undefined) ?? null;
    if (!cid) return null;
    const l = await getLoyaltyStatus(cid);
    return { customerId: cid, ...l };
  } catch {
    return null;
  }
}

/** Tjenesteprisen for en booking (til totalvisning i kassen). */
export async function getBookingPrice(bookingId: string): Promise<number> {
  await requireRole(["shop", "admin"]);
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("bookings")
      .select("price_nok")
      .eq("id", bookingId)
      .maybeSingle();
    return Number(data?.price_nok) || 0;
  } catch {
    return 0;
  }
}

export type BookingServiceState = {
  service: string | null;
  addons: string[];
  price: number;
};

/** Gjeldende behandling + tillegg + pris for en booking (til «endre behandling»). */
export async function getBookingServiceState(
  bookingId: string,
): Promise<BookingServiceState> {
  await requireRole(["shop", "admin"]);
  try {
    const sb = await createClient();
    const [{ data: b }, { data: ad }] = await Promise.all([
      sb
        .from("bookings")
        .select("price_nok, services(name)")
        .eq("id", bookingId)
        .maybeSingle(),
      sb.from("booking_addons").select("name").eq("booking_id", bookingId),
    ]);
    const s = b?.services as { name?: string } | null;
    return {
      service: s?.name ?? null,
      addons: ((ad ?? []) as { name: string }[]).map((a) => a.name),
      price: Number(b?.price_nok) || 0,
    };
  } catch {
    return { service: null, addons: [], price: 0 };
  }
}

/**
 * Endre behandlingen (og tilleggene) på en booket time. Pris og varighet
 * settes server-side fra `services`; den nye lengden kan ikke overlappe en
 * annen time for samme barber (da returneres feilen). Behandlinger sendes
 * som navn, slik appen ellers jobber. Se change_booking_service-RPC-en.
 */
export async function changeBookingService(
  bookingId: string,
  service: string,
  addons: string[] = [],
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  if (!bookingId || !service?.trim()) return { error: "Mangler behandling." };
  try {
    const sb = await createClient();
    const { error } = await sb.rpc("change_booking_service", {
      p_booking: bookingId,
      p_service: service.trim(),
      p_addons: addons.map((a) => a.trim()).filter(Boolean),
    });
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  } catch {
    return { error: "Kunne ikke endre behandlingen. Prøv igjen." };
  }
}

/**
 * Marker som ikke møtt. Kan valgfritt sende et vennlig gebyr-/påminnelsesvarsel
 * på e-post til kunden (hvis de har e-post). Gebyrbeløpet styres server-side
 * via NO_SHOW_FEE_NOK, slik at shop aldri ser kroner.
 */
export async function markNoShow(
  bookingId: string,
  opts?: { notify?: boolean },
): Promise<{ ok?: true; emailed?: boolean; error?: string }> {
  await requireRole(["shop", "admin"]);
  const sb = await createClient();

  const { error: updErr } = await sb
    .from("bookings")
    .update({ status: "no_show" })
    .eq("id", bookingId);
  if (updErr) return { error: updErr.message };

  let emailed = false;
  if (opts?.notify) {
    const { data: b } = await sb
      .from("bookings")
      .select(
        "start_at, customers(full_name, email), services(name), staff(full_name)",
      )
      .eq("id", bookingId)
      .maybeSingle();
    const c = b?.customers as { full_name?: string; email?: string } | null;
    if (b && c?.email) {
      const s = b.services as { name?: string } | null;
      const st = b.staff as { full_name?: string } | null;
      const feeNok = Number(process.env.NO_SHOW_FEE_NOK ?? "");
      const lang = await bookingCustomerLang(sb, bookingId);
      emailed = await sendNoShowEmail({
        to: c.email,
        name: c.full_name ?? "",
        service: await translateServiceText(s?.name ?? "", lang),
        barber: st?.full_name ?? "",
        date: fmtDay(b.start_at, lang),
        lang,
        fee: feeNok > 0 ? `${feeNok} kr` : undefined,
      });
    }
  }

  refresh();
  return { ok: true, emailed };
}

/**
 * Avlys en booking. En ekte time som ALLEREDE har passert kan ikke avlyses –
 * da skal den markeres «Ikke møtt» så no-show forblir synlig (ingen skjuling).
 * Eier/admin kan overstyre. Tidsblokker (uten kunde) kan alltid avlyses.
 */
export async function cancelBooking(
  bookingId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  const sb = await createClient();
  const { data: b } = await sb
    .from("bookings")
    .select("start_at, customer_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (b?.customer_id && new Date(b.start_at as string).getTime() < Date.now()) {
    const me = await getUserRole();
    if (!isAdminRole(me?.role)) {
      return {
        error:
          "En time som har passert kan ikke avlyses. Marker «Ikke møtt» eller «Fullført».",
      };
    }
  }

  const { error } = await sb
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);
  if (error) return { error: "Kunne ikke avlyse timen." };
  refresh();
  return { ok: true };
}

/**
 * Blokker tid / legg inn pause for en barber. Lagres som en booking uten kunde
 * eller tjeneste, så `available_slots` automatisk sperrer tiden for nettbooking
 * og blokken vises i kalenderen.
 */
export async function blockTime(
  barber: string,
  startIso: string,
  endIso: string,
  reason: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  if (!barber || !startIso || !endIso) return { error: "Mangler felt." };
  if (new Date(endIso) <= new Date(startIso))
    return { error: "Sluttid må være etter starttid." };
  try {
    const sb = await createClient();
    const { data: s } = await sb
      .from("staff")
      .select("id")
      .eq("full_name", barber)
      .eq("active", true)
      .maybeSingle();
    if (!s) return { error: "Fant ikke barberen." };
    const { error } = await sb.from("bookings").insert({
      staff_id: s.id,
      start_at: startIso,
      end_at: endIso,
      status: "confirmed",
      price_nok: 0,
      notes: reason.trim() || "Blokkert",
    });
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  } catch {
    return { error: "Kunne ikke blokkere tiden." };
  }
}

/** Flytt en booking til ny tid (og evt. ny barber). */
export async function rescheduleBooking(
  bookingId: string,
  startIso: string,
  barber?: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  try {
    const sb = await createClient();
    const { error } = await sb.rpc("reschedule_booking", {
      p_booking: bookingId,
      p_start: startIso,
      p_barber: barber ?? null,
    });
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  } catch {
    return { error: "Kunne ikke flytte timen." };
  }
}

/**
 * Endre en bookings LENGDE (dra-for-lengde i kalenderen). Starttiden beholdes,
 * kun sluttiden endres. Server-side validering (min 5 min, ingen overlapp,
 * ikke fullført/kansellert) ligger i set_booking_length-RPC-en.
 */
export async function setBookingLength(
  bookingId: string,
  endIso: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  if (!bookingId || !endIso) return { error: "Mangler felt." };
  try {
    const sb = await createClient();
    const { error } = await sb.rpc("set_booking_length", {
      p_booking: bookingId,
      p_end: endIso,
    });
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  } catch {
    return { error: "Kunne ikke endre lengden." };
  }
}

/**
 * Flytt en booking til en ANNEN barber – krever at den OPPRINNELIGE barberen
 * godkjenner med sin PIN (samme PIN som stemplingsuret). Tidspunktet beholdes;
 * krediteringen følger bookingen, så den nye barberen krediteres salget.
 */
export async function reassignBookingBarber(
  bookingId: string,
  newBarber: string,
  pin: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  try {
    const sb = await createClient();

    const { data: b } = await sb
      .from("bookings")
      .select("staff_id, start_at, staff(full_name)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!b) return { error: "Fant ikke timen." };
    if (!b.staff_id)
      return { error: "Timen har ingen barber å godkjenne overføringen fra." };

    const current = (b.staff as { full_name?: string } | null)?.full_name ?? null;
    if (current && current === newBarber)
      return { error: "Kunden står allerede hos denne barberen." };
    if (!/^\d{4}$/.test(pin.trim()))
      return { error: "PIN må være 4 siffer." };

    // Godkjenning: opprinnelig barber taster sin PIN.
    const { data: v, error: verr } = await sb.rpc("verify_pin_status", {
      p_staff: b.staff_id,
      p_pin: pin.trim(),
    });
    if (verr) return { error: "Kunne ikke verifisere PIN." };
    const res = String(v ?? "");
    if (res === "ERR:no_pin")
      return {
        error: `${current ?? "Barberen"} har ingen PIN satt. Be admin registrere en under Ansatte.`,
      };
    if (res.startsWith("ERR:")) return { error: "Feil PIN. Overføring avbrutt." };

    // Godkjent → flytt til ny barber, behold tidspunktet.
    const { error } = await sb.rpc("reschedule_booking", {
      p_booking: bookingId,
      p_start: b.start_at,
      p_barber: newBarber,
    });
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  } catch {
    return { error: "Kunne ikke flytte timen." };
  }
}

export type DeskBookingInput = {
  customerId?: string;
  name?: string;
  email?: string;
  phone?: string;
  service: string;
  barber: string;
  start: string; // ISO
};

/** Opprett booking fra skranken – eksisterende kunde eller ny (drop-in). */
export async function createDeskBooking(
  input: DeskBookingInput,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  if (!input.service || !input.barber || !input.start) {
    return { error: "Velg tjeneste, barber og tid." };
  }
  try {
    const sb = await createClient();
    let newId: string | null = null;

    // Kun kollisjon med barberens andre bookinger stopper lagring – turnus,
    // fravær og passert tid gjør det ikke (drop-in / etterregistrering).
    {
      const [{ data: svc }, { data: st }] = await Promise.all([
        sb.from("services").select("duration_min").eq("name", input.service).maybeSingle(),
        sb.from("staff").select("id").eq("full_name", input.barber).maybeSingle(),
      ]);
      if (!st) return { error: "Fant ikke barberen." };
      const startMs = new Date(input.start).getTime();
      if (Number.isNaN(startMs)) return { error: "Ugyldig tid." };
      const endIso = new Date(startMs + (Number(svc?.duration_min) || 30) * 60000).toISOString();
      const { data: clash } = await sb
        .from("bookings")
        .select("start_at, end_at, customers(full_name)")
        .eq("staff_id", st.id as string)
        .in("status", ["pending", "confirmed", "completed"])
        .lt("start_at", endIso)
        .gt("end_at", input.start)
        .limit(1);
      if (clash && clash.length) {
        const c = clash[0];
        const who = (c.customers as { full_name?: string } | null)?.full_name ?? "blokkering";
        return {
          error: `${input.barber} er allerede booket ${fmtClock(c.start_at as string)}–${fmtClock(c.end_at as string)} (${who}). Velg en annen tid.`,
        };
      }
    }

    if (input.customerId) {
      const { data, error } = await sb.rpc("create_booking_for_customer", {
        p_customer: input.customerId,
        p_service: input.service,
        p_barber: input.barber,
        p_start: input.start,
      });
      if (error) return { error: error.message };
      newId = (data as string) ?? null;
    } else {
      if (!input.name || !input.name.trim()) return { error: "Navn mangler." };
      const { data, error } = await sb.rpc("create_booking", {
        p_service: input.service,
        p_barber: input.barber,
        p_start: input.start,
        p_name: input.name.trim(),
        p_email: (input.email ?? "").trim(),
        p_phone: (input.phone ?? "").trim(),
      });
      if (error) return { error: error.message };
      newId = (data as string) ?? null;
    }

    // Send bekreftelse på e-post hvis kunden har e-post (også rebooking) –
    // ikke for bookinger som legges inn i etterkant (tiden har passert).
    if (newId && new Date(input.start).getTime() > Date.now()) {
      const { data: bk } = await sb
        .from("bookings")
        .select(
          "price_nok, start_at, customers(full_name, email, phone), services(name, duration_min), staff(full_name)",
        )
        .eq("id", newId)
        .maybeSingle();
      const c = bk?.customers as { full_name?: string; email?: string; phone?: string | null } | null;
      const lang = await bookingCustomerLang(sb, newId);
      // Bekreftelse på SMS (bare fremtidige timer, se sendBookingConfirmationSms).
      if (bk && (c?.phone || input.phone)) {
        const s2 = bk.services as { name?: string; duration_min?: number | null } | null;
        const st2 = bk.staff as { full_name?: string } | null;
        await sendBookingConfirmationSms({
          phone: c?.phone || input.phone,
          name: c?.full_name ?? input.name ?? "",
          service: s2?.name ?? input.service,
          durationMin: s2?.duration_min ?? null,
          barber: st2?.full_name || input.barber,
          startIso: bk.start_at as string,
          bookingId: newId,
          lang,
        });
      }
      if (bk && c?.email) {
        const s = bk.services as { name?: string } | null;
        const st = bk.staff as { full_name?: string } | null;
        await sendBookingConfirmation({
          to: c.email,
          name: c.full_name ?? input.name ?? "",
          service: await translateServiceText(s?.name ?? input.service, lang),
          barber: st?.full_name ?? input.barber,
          date: fmtDay(bk.start_at, lang),
          time: fmtClock(bk.start_at),
          price: `${bk.price_nok} kr`,
          lang,
        });
      }
    }

    refresh();
    return { ok: true };
  } catch {
    return { error: "Noe gikk galt ved booking." };
  }
}

/**
 * Drop-in: hold av tiden med en tjeneste UTEN å opprette en kunde. Timen er
 * anonym til betaling; der kan kassereren fylle inn kundeinfo (se
 * completeBooking) slik at et kundebilde opprettes først da. En drop-in er
 * altså en funksjon – ikke en kunde i kartoteket.
 */
export async function createDropinBooking(input: {
  service: string;
  barber: string;
  start: string;
}): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  if (!input.service || !input.barber || !input.start)
    return { error: "Velg tjeneste, barber og tid." };
  try {
    const sb = await createClient();
    const [{ data: svc }, { data: st }] = await Promise.all([
      sb
        .from("services")
        .select("id, duration_min, price_nok")
        .eq("name", input.service)
        .maybeSingle(),
      sb.from("staff").select("id").eq("full_name", input.barber).maybeSingle(),
    ]);
    if (!st) return { error: "Fant ikke barberen." };
    if (!svc) return { error: "Fant ikke tjenesten." };
    const startMs = new Date(input.start).getTime();
    if (Number.isNaN(startMs)) return { error: "Ugyldig tid." };
    const endIso = new Date(
      startMs + (Number(svc.duration_min) || 30) * 60000,
    ).toISOString();

    // Samme kollisjonssjekk som vanlig skranke-booking.
    const { data: clash } = await sb
      .from("bookings")
      .select("start_at, end_at, customers(full_name)")
      .eq("staff_id", st.id as string)
      .in("status", ["pending", "confirmed", "completed"])
      .lt("start_at", endIso)
      .gt("end_at", input.start)
      .limit(1);
    if (clash && clash.length) {
      const c = clash[0];
      const who =
        (c.customers as { full_name?: string } | null)?.full_name ??
        "blokkering";
      return {
        error: `${input.barber} er allerede booket ${fmtClock(c.start_at as string)}–${fmtClock(c.end_at as string)} (${who}). Velg en annen tid.`,
      };
    }

    const { error } = await sb.from("bookings").insert({
      staff_id: st.id,
      service_id: svc.id,
      start_at: input.start,
      end_at: endIso,
      status: "confirmed",
      price_nok: Number(svc.price_nok) || 0,
      customer_id: null,
      notes: "Drop-in",
    });
    if (error) return { error: error.message };
    refresh();
    return { ok: true };
  } catch {
    return { error: "Kunne ikke opprette drop-in." };
  }
}

/** Send (eller send på nytt) kvittering for en enkelt booking. */
export async function sendReceiptForBooking(
  bookingId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  try {
    const sb = await createClient();
    const { data: b } = await sb
      .from("bookings")
      .select(
        "price_nok, start_at, customers(full_name, email), services(name), staff(full_name)",
      )
      .eq("id", bookingId)
      .maybeSingle();
    const c = b?.customers as { full_name?: string; email?: string } | null;
    if (!b) return { error: "Fant ikke bookingen." };
    if (!c?.email) return { error: "Kunden mangler e-postadresse." };
    const s = b.services as { name?: string } | null;
    const st = b.staff as { full_name?: string } | null;
    const extras = await receiptExtras(sb, bookingId);
    const lang = await bookingCustomerLang(sb, bookingId);
    await sendReceiptEmail({
      to: c.email,
      name: c.full_name ?? "",
      service: await translateServiceText(s?.name ?? "", lang),
      barber: st?.full_name ?? "",
      date: fmtDay(b.start_at, lang),
      price: `${extras.totalNok ?? b.price_nok} kr`,
      discount: extras.discountNok,
      payments: extras.payments?.map((p) => ({ ...p, method: payMethodLang(p.method, lang) })),
      lang,
    });
    return { ok: true };
  } catch {
    return { error: "Kunne ikke sende kvittering." };
  }
}

export type CustomerHit = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  visits: number;
  last_visit: string | null;
};

/** Søk opp kunde i skranken. */
export async function searchCustomers(q: string): Promise<CustomerHit[]> {
  await requireRole(["shop", "admin"]);
  if (!q || q.trim().length < 2) return [];
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("shop_customer_search", { p_q: q.trim() });
    // Shop ser ikke telefonnummer – fjernes før det når nettleseren.
    return ((data as CustomerHit[]) ?? []).map((h) => ({ ...h, phone: null }));
  } catch {
    return [];
  }
}

/** Er den innloggede brukeren admin/eier? Brukes til å skjule admin-kun
 *  funksjoner i kassa (f.eks. «Drop-in» i ny booking) for shop-brukere. */
export async function getIsAdminUser(): Promise<boolean> {
  await requireRole(["shop", "admin"]);
  try {
    const me = await getUserRole();
    return !!me && isAdminRole(me.role);
  } catch {
    return false;
  }
}

/** Ledige starttider (HH:MM) for barber + tjeneste + dato. */
export async function getSlots(
  barber: string,
  service: string,
  date: string,
): Promise<string[]> {
  await requireRole(["shop", "admin"]);
  if (!barber || !service || !date) return [];
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("available_slots", {
      p_barber: barber,
      p_service: service,
      p_date: date,
    });
    return (data as string[]) ?? [];
  } catch {
    return [];
  }
}


/* ------------------------------ REBOOK ------------------------------ */

export type RebookOptions = {
  /** Datoen N uker frem (yyyy-mm-dd). */
  date: string;
  /** Samme klokkeslett som timen som nettopp ble betalt. */
  wantedTime: string;
  /** Er samme klokkeslett ledig hos samme barber? */
  sameTimeFree: boolean;
  /** Nærmeste ledige tider den dagen (når samme tid er tatt). */
  alternatives: string[];
  service: string;
  barber: string;
  customerName: string;
  error?: string;
};

function osloParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" }),
    time: d.toLocaleTimeString("en-GB", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }),
  };
}

/** Forslag til ny time N uker etter timen som nettopp ble betalt. */
export async function rebookOptions(bookingId: string, weeks: number): Promise<RebookOptions> {
  await requireRole(["shop", "admin"]);
  const empty: RebookOptions = {
    date: "", wantedTime: "", sameTimeFree: false, alternatives: [], service: "", barber: "", customerName: "",
  };
  const w = Math.round(Number(weeks));
  if (!Number.isFinite(w) || w < 1 || w > 52) return { ...empty, error: "Velg 1–52 uker." };
  try {
    const sb = await createClient();
    const { data: b } = await sb
      .from("bookings")
      .select("start_at, customers(full_name), services(name), staff(full_name)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!b) return { ...empty, error: "Fant ikke timen." };
    const service = (b.services as { name?: string } | null)?.name ?? "";
    const barber = (b.staff as { full_name?: string } | null)?.full_name ?? "";
    const customerName = (b.customers as { full_name?: string } | null)?.full_name ?? "";
    if (!service || !barber) return { ...empty, error: "Timen mangler tjeneste eller barber." };

    const { date: d0, time } = osloParts(b.start_at as string);
    const t = new Date(`${d0}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + w * 7);
    const date = t.toISOString().slice(0, 10);

    const slots = await getSlots(barber, service, date);
    const sameTimeFree = slots.includes(time);
    const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
    const alternatives = sameTimeFree
      ? []
      : [...slots].sort((a, c) => Math.abs(toMin(a) - toMin(time)) - Math.abs(toMin(c) - toMin(time))).slice(0, 6).sort();
    return { date, wantedTime: time, sameTimeFree, alternatives, service, barber, customerName };
  } catch {
    return { ...empty, error: "Kunne ikke hente ledige tider." };
  }
}

/** Book den nye timen for samme kunde (samme tjeneste og barber). */
export async function rebookCreate(
  bookingId: string,
  date: string,
  time: string,
): Promise<{ ok?: true; error?: string }> {
  await requireRole(["shop", "admin"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return { error: "Ugyldig dato/tid." };
  try {
    const sb = await createClient();
    const { data: b } = await sb
      .from("bookings")
      .select("customer_id, services(name), staff(full_name)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!b) return { error: "Fant ikke timen." };
    if (!b.customer_id)
      return { error: "Timen har ingen kunde registrert (drop-in uten navn) – book ny time via «+ Ny booking»." };
    const service = (b.services as { name?: string } | null)?.name ?? "";
    const barber = (b.staff as { full_name?: string } | null)?.full_name ?? "";
    return await createDeskBooking({
      customerId: (b.customer_id as string | null) ?? undefined,
      service,
      barber,
      start: osloToUtcISO(date, time),
    });
  } catch {
    return { error: "Kunne ikke booke ny time." };
  }
}
