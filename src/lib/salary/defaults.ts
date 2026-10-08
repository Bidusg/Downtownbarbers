import type { SalarySettings, SalaryPeriodInputs } from "@/lib/salary/types";

/* =====================================================================
 * Standardverdier (grunninnstillinger). En ansatt UTEN lagret rad i
 * salary_settings får disse. Default-provisjonen speiler dagens
 * bekreftede modell (grunnlønn + 40 % over 72 000 eks. mva, se
 * PAYROLL i ops-queries.ts). Tillegg/ferielønn er av som standard.
 * ===================================================================== */

export const DEFAULT_SALARY_SETTINGS: SalarySettings = {
  baseSalaryOverrideNok: null,
  commissionModel: "terskel",
  commissionRate: 0.4,
  commissionThresholdNok: 72000,
  commissionExVat: true,
  serviceRate: 0.4,
  productRate: 0.1,
  marketplaceRate: 0.4,
  enableMarketplace: false,
  enableEvening: false,
  eveningFrom: "19:00",
  eveningRateNok: 45,
  enableSaturday: false,
  saturdayFrom: "15:00",
  saturdayRateNok: 45,
  enableSunday: false,
  sundayRateNok: 45,
  enableVacationPay: false,
  vacationPayRate: 0.12,
  enableHolidayBonus: false,
  holidayBonusNok: 0,
  enableSickPay: false,
  sickRateNok: 0,
};

export const DEFAULT_SALARY_PERIOD: SalaryPeriodInputs = {
  eveningHours: 0,
  saturdayHours: 0,
  sundayHours: 0,
  sickHours: 0,
  vacationHours: 0,
  note: "",
};
