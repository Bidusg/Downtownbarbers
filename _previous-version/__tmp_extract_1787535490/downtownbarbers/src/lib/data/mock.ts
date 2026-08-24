/**
 * Testdata for dashboards (kobles til Supabase senere).
 * Lar oss vise det visuelle – fremdriftsbarer, nøkkeltall, grafer – uten live-DB.
 */

export const todayShop = {
  customersServed: 14,
  customersTarget: 20, // fase 1: kundeantall/dag (byttes til kronemål senere)
  nextUp: [
    { time: "14:30", customer: "Jonas H.", service: "Skin Fade", barber: "David" },
    { time: "15:00", customer: "Mikkel R.", service: "Herreklipp", barber: "Vani" },
    { time: "15:15", customer: "Ahmed S.", service: "Skjeggtrimming", barber: "Soren" },
    { time: "16:00", customer: "Lars T.", service: "Hår + Skjegg", barber: "David" },
  ],
};

// Admin ser kroner. Shop/ansatt gjør det ikke.
export const adminKpis = {
  revenueToday: 8450,
  bookingsToday: 14,
  completionRate: 0.93,
  avgRating: 4.7,
};

export const revenue7d = [
  { day: "Man", nok: 9200 },
  { day: "Tir", nok: 7600 },
  { day: "Ons", nok: 10400 },
  { day: "Tor", nok: 8800 },
  { day: "Fre", nok: 12600 },
  { day: "Lør", nok: 14100 },
  { day: "Søn", nok: 0 },
];

// Månedsmål per barber (admin ser kr + %; ansatt ser kun sin egen % uten kr)
export const barberGoals = [
  { name: "David", title: "Master Barber", achieved: 39000, target: 50000, rating: 4.9 },
  { name: "Soren", title: "Barber", achieved: 41000, target: 45000, rating: 4.8 },
  { name: "Stavros", title: "Barber", achieved: 31500, target: 45000, rating: 4.6 },
  { name: "Vani", title: "Barber", achieved: 27900, target: 45000, rating: 4.7 },
  { name: "Isak", title: "Barber", achieved: 20250, target: 45000, rating: 4.5 },
  { name: "Mehetabel", title: "Lærling", achieved: 9000, target: 30000, rating: 4.4 },
];

// Det en innlogget ansatt ser om SEG SELV (ingen kroner)
export const myStaff = {
  name: "David",
  title: "Master Barber",
  monthProgressPct: 78,
  rating: 4.9,
  ratingCount: 63,
  bookingsThisWeek: 41,
};
