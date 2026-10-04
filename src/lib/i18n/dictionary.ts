// Ordbok for det klient-side språkbyttet (Etappe 4).
// v1: kun hardkodet UI-tekst (chrome). DB-innhold (tjenestenavn/-beskrivelser,
// hero-tekst fra site-settings) oversettes IKKE her.

export type Lang = "no" | "en";

export type Dict = Record<string, { no: string; en: string }>;

export const dictionary: Dict = {
  // ---- Header / navigasjon ----
  "nav.handverket": { no: "Håndverket", en: "The Craft" },
  "nav.galleri": { no: "Galleri", en: "Gallery" },
  "nav.tjenester": { no: "Tjenester", en: "Services" },
  "nav.team": { no: "Team", en: "Team" },
  "nav.butikk": { no: "Butikk", en: "Shop" },
  "nav.kontakt": { no: "Kontakt", en: "Contact" },
  "header.book": { no: "Bestill time", en: "Book now" },
  "header.login": { no: "Logg inn", en: "Log in" },
  "header.openMenu": { no: "Åpne meny", en: "Open menu" },
  "header.closeMenu": { no: "Lukk meny", en: "Close menu" },
  "header.langLabel": { no: "Språk", en: "Language" },

  // ---- Booking: steg-faner ----
  "step.services": { no: "Tjenester", en: "Services" },
  "step.time": { no: "Tid", en: "Time" },
  "step.contact": { no: "Kontakt", en: "Contact" },

  // ---- Booking: generelt ----
  "common.from": { no: "fra ", en: "from " },
  "common.at": { no: "kl.", en: "at" },

  // ---- Booking: steg 0 (tjenester + kurv) ----
  "wiz.add": { no: "+ Legg til", en: "+ Add" },
  "wiz.emptyCart": {
    no: "Legg til én eller flere tjenester for å fortsette.",
    en: "Add one or more services to continue.",
  },
  "wiz.yourCart": { no: "Din kurv", en: "Your cart" },
  "wiz.modeSingle": {
    no: "Én person (etter hverandre)",
    en: "One person (consecutive)",
  },
  "wiz.modeGroup": {
    no: "Flere personer (samtidig)",
    en: "Several people (simultaneous)",
  },
  "wiz.barberForVisit": { no: "Barber for besøket", en: "Barber for the visit" },
  "wiz.anyBarber": { no: "Hvilken som helst", en: "Anyone" },
  "wiz.remove": { no: "Fjern", en: "Remove" },
  "wiz.chooseBarber": { no: "Velg barber …", en: "Choose barber …" },
  "wiz.personName": { no: "Navn", en: "Name" },
  "wiz.person": { no: "Person", en: "Person" },
  "wiz.addonsLabel": { no: "Legg til", en: "Add-ons" },
  "wiz.needBarbers": {
    no: "Velg barber for hver person.",
    en: "Choose a barber for each person.",
  },
  "wiz.chooseTime": { no: "Velg tid →", en: "Choose time →" },

  // ---- Booking: steg 1 (tid) ----
  "wiz.chooseDayTime": { no: "Velg dag og tid", en: "Choose day and time" },
  "wiz.editCart": { no: "← Endre kurv", en: "← Edit cart" },
  "wiz.noOpenDays": {
    no: "Ingen åpne dager tilgjengelig akkurat nå.",
    en: "No open days available right now.",
  },
  "wiz.loadingSlots": { no: "Henter ledige tider …", en: "Loading available times …" },
  "wiz.slotsError": {
    no: "Kunne ikke hente ledige tider akkurat nå. Prøv igjen om litt.",
    en: "Could not load available times right now. Please try again shortly.",
  },
  "wiz.noSlotsPeriod": {
    no: "Ingen ledige tider som passer hele bestillingen i perioden. Prøv færre tjenester, andre barbere, eller «flere personer»-modus.",
    en: "No available times that fit the whole booking in this period. Try fewer services, other barbers, or the “several people” mode.",
  },
  "wiz.noSlotsDay": {
    no: "Ingen ledige tider denne dagen – velg en annen.",
    en: "No available times this day – choose another.",
  },
  "wiz.toContact": { no: "Videre til kontakt →", en: "Continue to contact →" },

  // ---- Booking: steg 2 (kontakt) ----
  "wiz.yourDetails": { no: "Dine opplysninger", en: "Your details" },
  "wiz.editTime": { no: "← Endre tid", en: "← Edit time" },
  "wiz.fullName": { no: "Fullt navn", en: "Full name" },
  "wiz.email": { no: "E-post", en: "Email" },
  "wiz.phone": { no: "Telefonnummer", en: "Phone number" },
  "wiz.countryCode": { no: "Landskode", en: "Country code" },
  "wiz.phoneAria": { no: "Telefon", en: "Phone" },
  "wiz.source": {
    no: "Hvordan hørte du om oss? (valgfritt)",
    en: "How did you hear about us? (optional)",
  },
  "wiz.marketingConsent": {
    no: "Ja, jeg vil motta tilbud og nyheter fra Downtown Barbers på e-post.",
    en: "Yes, I want to receive offers and news from Downtown Barbers by email.",
  },
  "wiz.invalidEmail": { no: "Ugyldig e-postadresse.", en: "Invalid email address." },
  "wiz.invalidPhone": { no: "Ugyldig telefonnummer.", en: "Invalid phone number." },
  "wiz.booking": { no: "Bestiller …", en: "Booking …" },
  "wiz.confirm": { no: "Bekreft bestilling", en: "Confirm booking" },

  // ---- Booking: suksess ----
  "wiz.thanks": { no: "Takk! 💈", en: "Thank you! 💈" },
  "wiz.confirmed": { no: "Bestillingen er bekreftet:", en: "Your booking is confirmed:" },
  "wiz.myPage": { no: "Min side →", en: "My page →" },
  "wiz.cancel": { no: "Avbestill", en: "Cancel" },
  "wiz.emailConfirm": {
    no: "Vi sender også en bekreftelse på e-post.",
    en: "We'll also send a confirmation by email.",
  },
};
