import type {
  SalarySettings,
  SalaryPeriodInputs,
  SalaryManualLine,
  SalaryContext,
  SalaryLine,
  SalaryResult,
} from "@/lib/salary/types";
import { num2, kr2, pct } from "@/lib/salary/format";

/* =====================================================================
 * Ren, testbar lønnsberegning per ansatt/måned.
 *
 *   Tar innstillinger + periodens timer/omsetning/fravær og produserer
 *   rapportlinjene (Type, Formel-tekst, Beløp) + brutto sum. Ingen
 *   side-effekter og ingen server-import, så den kan kjøre LIVE i
 *   nettleseren mens revisor justerer felter.
 *
 *   Reelle tall (gjenbrukt, ikke funnet opp på nytt):
 *     • grunnlønn + avkorting for del av måned + fraværstrekk (samme
 *       semantikk som absence-pay.ts / getPayroll)
 *     • provisjon fra faktisk omsetning (eks. mva) over terskel
 *
 *   Forenklet/stubbet i denne MVP-en (markeres i rapporten):
 *     • ferielønn, feriebonus, sykefravær-sats – bekreftes med Kumar/eier
 *     • markedsplass-provisjon – kildedata skiller ikke markedsplass ennå
 *     • overtid 50/100 % og helligdagstillegg – ikke med (legges som
 *       manuelle linjer inntil timedata finnes)
 * ===================================================================== */

/** Effektiv grunnlønn etter avkorting (del av måned) + fraværstrekk.
 *  Speiler baseSalaryForMonth i absence-pay.ts, men regnet lokalt så
 *  overstyrt grunnlønn oppdaterer tallene live. */
function baseBreakdown(base: number, ctx: SalaryContext) {
  const employmentDeduction =
    ctx.employedDays >= ctx.daysInMonth || ctx.daysInMonth <= 0
      ? 0
      : Math.round(base * (1 - ctx.employedDays / ctx.daysInMonth));
  const remaining = base - employmentDeduction;
  const rawAbsence =
    ctx.absenceDays > 0 && ctx.workdays > 0
      ? Math.round((base * ctx.absenceDays) / ctx.workdays)
      : 0;
  const absenceDeduction = Math.min(remaining, rawAbsence);
  return {
    employmentDeduction,
    absenceDeduction,
    effectiveBase: remaining - absenceDeduction,
  };
}

export function effectiveBaseSalary(settings: SalarySettings, ctx: SalaryContext): number {
  return settings.baseSalaryOverrideNok ?? ctx.staffBaseSalaryNok;
}

export function computeSalary(
  settings: SalarySettings,
  period: SalaryPeriodInputs,
  manualLines: SalaryManualLine[],
  ctx: SalaryContext,
): SalaryResult {
  const lines: SalaryLine[] = [];
  const base = effectiveBaseSalary(settings, ctx);
  const bb = baseBreakdown(base, ctx);

  // 1) Grunnlønn (etter ev. avkorting for del av måned)
  if (bb.employmentDeduction > 0) {
    lines.push({
      key: "grunnlonn",
      label: "Grunnlønn",
      formula: `${kr2(base)} × ${ctx.employedDays}/${ctx.daysInMonth} dager ansatt = ${kr2(
        base - bb.employmentDeduction,
      )}`,
      amountNok: base - bb.employmentDeduction,
    });
  } else {
    lines.push({
      key: "grunnlonn",
      label: "Grunnlønn",
      formula: `Fastlønn ${kr2(base)}`,
      amountNok: base,
    });
  }

  // 2) Trekk for fravær (ulønnet permisjon / ugyldig fravær)
  if (bb.absenceDeduction > 0) {
    lines.push({
      key: "trekk-fravaer",
      label: "Trekk – ulønnet/ugyldig fravær",
      formula: `${kr2(base)} ÷ ${ctx.workdays} arbeidsdager × ${ctx.absenceDays} fraværsdager = −${kr2(
        bb.absenceDeduction,
      )}`,
      amountNok: -bb.absenceDeduction,
    });
  }

  // 3) Provisjon
  const netExVat = ctx.grossInclVatNok / (1 + ctx.mva);
  if (settings.commissionModel === "terskel") {
    const commBaseRaw = settings.commissionExVat ? netExVat : ctx.grossInclVatNok;
    const commBase = Math.max(0, commBaseRaw - settings.commissionThresholdNok);
    const commission = commBase * settings.commissionRate;
    const vatLabel = settings.commissionExVat ? "eks. mva" : "inkl. mva";
    lines.push({
      key: "provisjon",
      label: "Provisjon (terskelmodell)",
      formula:
        commBase > 0
          ? `maks(0; ${kr2(commBaseRaw)} ${vatLabel} − terskel ${kr2(
              settings.commissionThresholdNok,
            )}) × ${pct(settings.commissionRate)} = ${kr2(commission)}`
          : `omsetning ${kr2(commBaseRaw)} ${vatLabel} under terskel ${kr2(
              settings.commissionThresholdNok,
            )} → ingen provisjon`,
      amountNok: commission,
    });
  } else {
    // Split-modell (Timma-stil): egen sats for tjeneste / vare / markedsplass.
    const serviceBaseRaw = settings.commissionExVat
      ? ctx.serviceInclVatNok / (1 + ctx.mva)
      : ctx.serviceInclVatNok;
    const productBaseRaw = settings.commissionExVat
      ? ctx.productInclVatNok / (1 + ctx.mva)
      : ctx.productInclVatNok;
    const vatLabel = settings.commissionExVat ? "eks. mva" : "inkl. mva";
    const serviceComm = serviceBaseRaw * settings.serviceRate;
    lines.push({
      key: "tjeneste-provisjon",
      label: "Tjeneste-provisjon",
      formula: `${kr2(serviceBaseRaw)} tjenester ${vatLabel} × ${pct(settings.serviceRate)} = ${kr2(
        serviceComm,
      )}`,
      amountNok: serviceComm,
      stubbed: !ctx.splitAvailable,
    });
    const productComm = productBaseRaw * settings.productRate;
    lines.push({
      key: "produkt-provisjon",
      label: "Produktsalg",
      formula: `${kr2(productBaseRaw)} varesalg ${vatLabel} × ${pct(settings.productRate)} = ${kr2(
        productComm,
      )}`,
      amountNok: productComm,
      stubbed: !ctx.splitAvailable || ctx.productInclVatNok === 0,
    });
    if (settings.enableMarketplace) {
      lines.push({
        key: "markedsplass-provisjon",
        label: "Provisjon fra markedsplass-kunder",
        formula: `markedsplass-kunder skilles ikke i kassedata ennå – legg inn manuelt (sats ${pct(
          settings.marketplaceRate,
        )})`,
        amountNok: 0,
        stubbed: true,
      });
    }
  }

  // 4) Bonus / tillegg (timebasert)
  if (settings.enableEvening && period.eveningHours > 0) {
    const amt = period.eveningHours * settings.eveningRateNok;
    lines.push({
      key: "kveldstillegg",
      label: `Kveldstillegg (fra kl. ${settings.eveningFrom})`,
      formula: `${num2(period.eveningHours)} timer × ${kr2(settings.eveningRateNok)}/time = ${kr2(amt)}`,
      amountNok: amt,
    });
  }
  if (settings.enableSaturday && period.saturdayHours > 0) {
    const amt = period.saturdayHours * settings.saturdayRateNok;
    lines.push({
      key: "lordagstillegg",
      label: `Lørdagstillegg (fra kl. ${settings.saturdayFrom})`,
      formula: `${num2(period.saturdayHours)} timer × ${kr2(settings.saturdayRateNok)}/time = ${kr2(amt)}`,
      amountNok: amt,
    });
  }
  if (settings.enableSunday && period.sundayHours > 0) {
    const amt = period.sundayHours * settings.sundayRateNok;
    lines.push({
      key: "sondagstillegg",
      label: "Søndagstillegg",
      formula: `${num2(period.sundayHours)} timer × ${kr2(settings.sundayRateNok)}/time = ${kr2(amt)}`,
      amountNok: amt,
    });
  }

  // 5) Lønninger-kortet: sykefravær, ferielønn, feriebonus (forenklet)
  if (settings.enableSickPay && period.sickHours > 0) {
    const amt = period.sickHours * settings.sickRateNok;
    lines.push({
      key: "sykefravaer",
      label: "Sykefravær (betalt)",
      formula: `${num2(period.sickHours)} timer × ${kr2(settings.sickRateNok)}/time = ${kr2(amt)}`,
      amountNok: amt,
      stubbed: true,
    });
  }
  if (settings.enableVacationPay) {
    // Forenklet: andel av månedens grunnlønn+provisjon. Riktig ferielønn
    // regnes normalt av FJORÅRETS feriepengegrunnlag – bekreftes med Kumar.
    const vacGrunnlag =
      lines.reduce((s, l) => s + Math.max(0, l.amountNok), 0);
    const amt = vacGrunnlag * settings.vacationPayRate;
    lines.push({
      key: "ferielonn",
      label: "Ferielønn",
      formula: `${kr2(vacGrunnlag)} × ${pct(settings.vacationPayRate)} = ${kr2(amt)} (forenklet – fjorårets grunnlag mangler)`,
      amountNok: amt,
      stubbed: true,
    });
  }
  if (settings.enableHolidayBonus && settings.holidayBonusNok !== 0) {
    lines.push({
      key: "feriebonus",
      label: "Feriebonus",
      formula: `Fast beløp ${kr2(settings.holidayBonusNok)}`,
      amountNok: settings.holidayBonusNok,
      stubbed: true,
    });
  }

  // 6) Manuelle trekk/tillegg (lån, forskudd, m.m.)
  for (const m of [...manualLines].sort((a, b) => a.sort - b.sort)) {
    lines.push({
      key: `manuell-${m.id}`,
      label: m.label || (m.amountNok < 0 ? "Trekk" : "Tillegg"),
      formula: m.amountNok < 0 ? `Manuelt trekk ${kr2(m.amountNok)}` : `Manuelt tillegg ${kr2(m.amountNok)}`,
      amountNok: m.amountNok,
    });
  }

  const totalNok = lines.reduce((s, l) => s + l.amountNok, 0);
  return { lines, totalNok };
}
