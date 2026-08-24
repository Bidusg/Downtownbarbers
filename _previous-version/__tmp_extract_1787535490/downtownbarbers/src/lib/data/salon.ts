/**
 * Statisk grunndata for kundesiden (speiler seed.sql).
 * Byttes ut med live Supabase-data når databasen er koblet på.
 * Priser/varighet er PLASSHOLDERE til ekte prisliste er klar.
 */

export const salon = {
  name: "Downtown Barbers",
  slogan: "Der presisjon møter stil",
  established: 2018,
  intro:
    "Freshe klipper, skarpe fades og ekspert grooming – midt i hjertet av Oslo.",
  address: "Osterhaus' gate 10, 0183 Oslo",
  phone: "+47 463 58 764",
  rating: 4.5,
  ratingCount: 6,
  social: {
    tiktok: "https://www.tiktok.com/@downtownbarbers",
    instagram: "https://www.instagram.com/downtownbarbersoslo",
    facebook: "https://www.facebook.com/downtownbarbersOslo",
  },
  openingHours: [
    { day: "Mandag", hours: "09:00 – 19:00" },
    { day: "Tirsdag", hours: "09:00 – 19:00" },
    { day: "Onsdag", hours: "09:00 – 19:00" },
    { day: "Torsdag", hours: "09:00 – 19:00" },
    { day: "Fredag", hours: "09:00 – 19:00" },
    { day: "Lørdag", hours: "09:00 – 19:00" },
    { day: "Søndag", hours: "Stengt" },
  ],
};

export type Service = {
  name: string;
  description: string;
  price: string; // plassholder
  duration: string; // plassholder
};

// Ekte priser reddet fra tidligere versjon av appen.
export const serviceCategories: { name: string; services: Service[] }[] = [
  {
    name: "Hår & klipp",
    services: [
      { name: "Herreklipp", description: "Klassisk herreklipp, vask og styling inkludert.", price: "350 kr", duration: "30 min" },
      { name: "Skin Fade", description: "Gradert fade fra huden – vår signatur-tjeneste.", price: "450 kr", duration: "45 min" },
      { name: "Barneklipp", description: "For kunder under 12 år.", price: "250 kr", duration: "20 min" },
    ],
  },
  {
    name: "Skjegg & grooming",
    services: [
      { name: "Skjeggtrimming", description: "Forming, trimming og stell av skjegg.", price: "200 kr", duration: "20 min" },
      { name: "Hår + Skjegg", description: "Full service: klipp og skjeggpleie i én sesjon.", price: "580 kr", duration: "60 min" },
      { name: "Tradisjonell barbering", description: "Varm håndklé, skum og barberblad.", price: "350 kr", duration: "30 min" },
    ],
  },
  {
    name: "Ansikt & detalj",
    services: [
      { name: "Øyenbrynsvoksing", description: "Forming og voksing av øyenbryn.", price: "150 kr", duration: "15 min" },
      { name: "Ansiktsmaske", description: "Dyprengjørende ansiktsmaske etter barbering.", price: "250 kr", duration: "20 min" },
    ],
  },
];

export type TeamMember = {
  name: string;
  title: string;
  employeeNumber: string;
};

export const team: TeamMember[] = [
  { name: "David", title: "Master Barber", employeeNumber: "DB-001" },
  { name: "Vani", title: "Barber", employeeNumber: "DB-002" },
  { name: "Soren", title: "Barber", employeeNumber: "DB-003" },
  { name: "Isak", title: "Barber", employeeNumber: "DB-004" },
  { name: "Stavros", title: "Barber", employeeNumber: "DB-005" },
  { name: "Mehetabel", title: "Lærling", employeeNumber: "DB-006" },
];
