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

  // ---- Forside: hero ----
  "home.hero.since": { no: "Siden", en: "Since" },
  "home.hero.reviews": { no: "vurderinger", en: "reviews" },

  // ---- Forside: om oss ----
  "home.about.eyebrow": { no: "Om oss", en: "About us" },
  "home.about.cta": { no: "Bestill din time", en: "Book your appointment" },

  // ---- Forside: håndverket ----
  "home.craft.eyebrow": { no: "Håndverket", en: "The Craft" },
  "home.craft.title": {
    no: "Det du kjenner idet du reiser deg fra stolen.",
    en: "What you feel the moment you rise from the chair.",
  },

  // ---- Forside: galleri ----
  "home.gallery.eyebrow": { no: "Galleri", en: "Gallery" },
  "home.gallery.title": { no: "Fra stolen", en: "From the chair" },

  // ---- Forside: tjenester ----
  "home.services.eyebrow": { no: "Tjenester", en: "Services" },
  "home.services.title": { no: "Prisliste", en: "Price list" },

  // ---- Forside: cta-banner ----
  "home.cta.button": { no: "Bestill time nå", en: "Book now" },

  // ---- Forside: team ----
  "home.team.eyebrow": { no: "Teamet", en: "The Team" },
  "home.team.title": { no: "Håndverkerne", en: "The Craftsmen" },

  // ---- Forside: åpningstider + kontakt ----
  "home.hours.eyebrow": { no: "Åpningstider", en: "Opening hours" },
  "home.contact.eyebrow": { no: "Kontakt", en: "Contact" },

  // ---- Anmeldelser (GoogleReviews) ----
  "reviews.eyebrow": { no: "Anmeldelser", en: "Reviews" },
  "reviews.title": { no: "Hva kundene sier", en: "What customers say" },
  "reviews.onGoogle": {
    no: "anmeldelser på Google",
    en: "reviews on Google",
  },
  "reviews.fromGoogle": { no: "Anmeldelser fra Google", en: "Reviews from Google" },
  "reviews.seeAll": { no: "Se alle på Google", en: "See all on Google" },

  // ---- Footer ----
  "footer.rights": {
    no: "Alle rettigheter forbeholdt.",
    en: "All rights reserved.",
  },

  // ---- Booking-side ----
  "booking.eyebrow": { no: "Bestill time", en: "Book appointment" },
  "booking.heading": { no: "Sett deg ned.", en: "Have a seat." },
  "booking.intro": {
    no: "Fire steg: tjeneste, barber, tid og kontakt. Bekreftelse på e-post med en gang.",
    en: "Four steps: service, barber, time and contact. Email confirmation right away.",
  },

  // ---- Butikk-side ----
  "butikk.eyebrow": { no: "Produkter & gavekort", en: "Products & gift cards" },
  "butikk.title": { no: "Over disk", en: "Over the counter" },
  "butikk.intro.base": {
    no: "De samme produktene vi bruker i stolen",
    en: "The same products we use in the chair",
  },
  "butikk.intro.gift": {
    no: " – pluss gavekort som alltid sitter. ",
    en: " – plus gift cards that always fit. ",
  },
  "butikk.intro.plain": { no: ". ", en: ". " },
  "butikk.intro.tail": {
    no: "Alt kjøpes i salongen: stikk innom eller ring, så legger vi det av til deg.",
    en: "Everything is bought in the salon: drop by or call, and we'll set it aside for you.",
  },
  "butikk.box.titleBase": { no: "Kjøp i salongen", en: "Buy in the salon" },
  "butikk.box.titleGift": { no: " – også gavekort", en: " – gift cards too" },
  "butikk.box.bodyProducts": { no: "Vi selger produkter", en: "We sell products" },
  "butikk.box.bodyGift": { no: " og gavekort", en: " and gift cards" },
  "butikk.box.bodyTail": {
    no: " direkte over disk – ingen frakt og ingen ventetid. Nettbutikk med betaling og levering er på vei; til da får du alt raskest ved å komme innom.",
    en: " directly over the counter – no shipping and no waiting. An online shop with payment and delivery is on the way; until then the fastest way is to come by.",
  },

  // ---- Produktkort ----
  "product.badge.gift": { no: "Gavekort · i salongen", en: "Gift card · in salon" },
  "product.badge.inStore": { no: "I salongen", en: "In the salon" },
  "product.buyInStore": { no: "Kjøp i salongen", en: "Buy in salon" },
};
