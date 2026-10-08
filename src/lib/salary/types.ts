/* =====================================================================
 * Typer for lønnsmodellen per ansatt (klient- og server-trygg – ingen
 * server-import her, slik at compute kan kjøre live i nettleseren).
 * ===================================================================== */

/** Lønnsinnstillinger per ansatt. Speiler tabellen salary_settings. */
export type SalarySettings = {
  /** Fastlønn-overstyring (kr/mnd). null → bruk ansattes grunnlønn / standard. */
  baseSalaryOverrideNok: number | null;
  commissionModel: "terskel" | "split";
  commissionRate: number; // 0.40 = 40 %
  commissionThresholdNok: number;
  commissionExVat: boolean;
  serviceRate: number;
  productRate: number;
  marketplaceRate: number;
  enableMarketplace: boolean;
  enableEvening: boolean;
  eveningFrom: string; // "HH:MM"
  eveningRateNok: number;
  enableSaturday: boolean;
  saturdayFrom: string; // "HH:MM"
  saturdayRateNok: number;
  enableSunday: boolean;
  sundayRateNok: number;
  enableVacationPay: boolean;
  vacationPayRate: number;
  enableHolidayBonus: boolean;
  holidayBonusNok: number;
  enableSickPay: boolean;
  sickRateNok: number;
};

/** Periode-input (timer) per ansatt/måned. Speiler salary_period. */
export type SalaryPeriodInputs = {
  eveningHours: number;
  saturdayHours: number;
  sundayHours: number;
  sickHours: number;
  vacationHours: number;
  note: string;
};

/** Manuell trekk/tillegg-linje (negativt beløp = trekk). */
export type SalaryManualLine = {
  id: string;
  label: string;
  amountNok: number;
  sort: number;
};

/** Faste tall for ansatt/måned (regnet server-side fra kalender/turnus). */
export type SalaryContext = {
  /** Ansattes grunnlønn (staff.base_salary_nok ?? app-standard). */
  staffBaseSalaryNok: number;
  employedDays: number;
  daysInMonth: number;
  absenceDays: number; // trekk-fravær (ulønnet/ugyldig)
  workdays: number; // arbeidsdager i måneden (turnus / man–fre)
  /** Omsetning inkl. mva (sum sales.total_nok via sikret rutine). */
  grossInclVatNok: number;
  /** Tjeneste-/varesalg inkl. mva (split-RPC; 0 hvis ikke tilgjengelig). */
  serviceInclVatNok: number;
  productInclVatNok: number;
  /** true hvis split-tallene faktisk ble hentet (ellers merkes de stubbet). */
  splitAvailable: boolean;
  mva: number; // 0.25
};

/** Én linje i rapporten (Type | Formel | Beløp). */
export type SalaryLine = {
  key: string;
  label: string;
  formula: string;
  amountNok: number;
  /** true → forenklet/stubbet, markeres tydelig i rapporten. */
  stubbed?: boolean;
};

export type SalaryResult = {
  lines: SalaryLine[];
  /** Brutto sum beregnet lønn (sum av alle linjer). */
  totalNok: number;
};
