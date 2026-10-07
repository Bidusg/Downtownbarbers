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
  "step.services": { no: "Tjeneste", en: "Service" },
  "step.barber": { no: "Barber", en: "Barber" },
  "step.time": { no: "Tid", en: "Time" },
  "wiz.whoCuts": { no: "Hvem vil du booke hos?", en: "Who would you like to book with?" },
  "wiz.anyBarberHint": { no: "Første ledige", en: "First available" },
  "wiz.toBarber": { no: "Velg barber →", en: "Choose barber →" },
  "wiz.toTime": { no: "Velg tid →", en: "Choose time →" },
  "wiz.editBarber": { no: "← Endre barber", en: "← Change barber" },
  "step.contact": { no: "Info", en: "Details" },

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
  "wiz.findNext": { no: "Finn neste ledige tid", en: "Find next available time" },
  "wiz.findingNext": { no: "Leter etter neste ledige tid …", en: "Looking for the next available time …" },
  "wiz.noNextSlot": {
    no: "Fant ingen ledige tider det neste halvåret. Prøv en annen barber eller ring oss.",
    en: "No available times in the next six months. Try another barber or call us.",
  },
  "wiz.tryFindNext": {
    no: "Trykk «Finn neste ledige tid» for å lete lenger frem.",
    en: "Tap “Find next available time” to search further ahead.",
  },
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
  "wiz.toContact": { no: "Videre til info →", en: "Continue to details →" },

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
  "wiz.confirm": { no: "Fullfør booking", en: "Complete booking" },

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
  "home.services.note": {
    no: "NB! Prisen vil variere fra frisør til frisør.",
    en: "Note: the price varies from barber to barber.",
  },

  // ---- Forside: cta-banner ----
  "home.cta.button": { no: "Bestill time nå", en: "Book now" },

  // ---- Forside: team ----
  "home.team.eyebrow": { no: "Teamet", en: "The Team" },
  "home.team.title": { no: "Håndverkerne", en: "The Craftsmen" },
  "home.team.book": { no: "Book nå", en: "Book now" },
  "wiz.note.label": { no: "Notat til barberen (valgfritt)", en: "Note to the barber (optional)" },
  "wiz.note.placeholder": {
    no: "F.eks. ønsker, allergier eller noe vi bør vite før du kommer",
    en: "E.g. wishes, allergies or anything we should know before you arrive",
  },

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
  "reviews.seeAllTa": { no: "Se alle på Tripadvisor", en: "See all on Tripadvisor" },

  // ---- Footer ----
  "footer.rights": {
    no: "Alle rettigheter forbeholdt.",
    en: "All rights reserved.",
  },

  // ---- Booking-side ----
  "booking.eyebrow": { no: "Bestill time", en: "Book appointment" },
  "booking.heading": { no: "Slå deg ned.", en: "Have a seat." },
  "booking.intro": {
    no: "Fire steg: tjeneste, barber, tid og info. Bekreftelse på e-post med en gang.",
    en: "Four steps: service, barber, time and details. Email confirmation right away.",
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

  // ---- Booking: tillegg (kurv, oppsummering, skjema, tilgjengelighet) ----
  "wiz.viewCart": { no: "Se handlekurv", en: "View cart" },
  "wiz.addMore": { no: "+ Legg til flere", en: "+ Add more" },
  "wiz.close": { no: "Lukk", en: "Close" },
  "wiz.addService": { no: "Legg til", en: "Add" },
  "wiz.inCart": { no: "I kurven", en: "In cart" },
  "wiz.total": { no: "Totalt", en: "Total" },
  "wiz.estimateNote": {
    no: "«fra»-pris: endelig pris avhenger av hvilken barber du får.",
    en: "“from” price: the final price depends on which barber you get.",
  },
  "wiz.goToStep": { no: "Gå til steg", en: "Go to step" },
  "wiz.summary.when": { no: "Når", en: "When" },
  "wiz.summary.barber": { no: "Barber", en: "Barber" },
  "wiz.summary.price": { no: "Pris", en: "Price" },
  "wiz.summary.addons": { no: "Tillegg", en: "Add-ons" },
  "wiz.fillToConfirm": {
    no: "Fyll inn navn, e-post og telefon for å bekrefte.",
    en: "Fill in name, email and phone to confirm.",
  },
  "wiz.source.placeholder": { no: "Velg …", en: "Choose …" },
  "wiz.source.google": { no: "Google-søk / Google Maps", en: "Google search / Google Maps" },
  "wiz.source.social": { no: "Instagram / TikTok / Facebook", en: "Instagram / TikTok / Facebook" },
  "wiz.source.friend": { no: "Anbefalt av venn eller familie", en: "Recommended by a friend or family" },
  "wiz.source.walkby": { no: "Gikk forbi / så skiltet", en: "Walked by / saw the sign" },
  "wiz.source.returning": { no: "Har vært kunde før", en: "Returning customer" },
  "wiz.source.other": { no: "Annet", en: "Other" },
  "wiz.slotsOn": { no: "ledige tider", en: "available times" },
  "wiz.noSlotsShort": { no: "ingen ledige", en: "fully booked" },

  // ---- Bekreftelse-side (/booking/bekreftelse) ----
  "confirm.paidTitle": { no: "Betalt og bekreftet! 💈", en: "Paid and confirmed! 💈" },
  "confirm.title": { no: "Timen er bekreftet! 💈", en: "Your appointment is confirmed! 💈" },
  "confirm.paidBody": {
    no: "Depositumet er registrert. Vi gleder oss til å se deg.",
    en: "Your deposit is registered. We look forward to seeing you.",
  },
  "confirm.body": {
    no: "Vi sender en bekreftelse på e-post. Vi gleder oss til å se deg.",
    en: "We'll send a confirmation by email. We look forward to seeing you.",
  },
  "confirm.failedTitle": { no: "Betalingen ble avbrutt", en: "Payment was cancelled" },
  "confirm.failedBody": {
    no: "Timen din er fortsatt reservert – du kan betale i salongen.",
    en: "Your appointment is still reserved – you can pay in the salon.",
  },
  "common.toFront": { no: "Til forsiden", en: "Back to home" },
  "common.bookNew": { no: "Bestill ny time", en: "Book a new appointment" },

  // ---- 404 ----
  "notfound.title": { no: "Siden finnes ikke", en: "Page not found" },
  "notfound.body": {
    no: "Vi fant ikke siden du lette etter. Den kan ha blitt flyttet, eller så skrev du kanskje feil adresse.",
    en: "We couldn't find the page you were looking for. It may have moved, or the address may be misspelled.",
  },

  // ---- Vurdering (/vurder) ----
  "rate.eyebrow": { no: "Hvordan var besøket?", en: "How was your visit?" },
  "rate.hint": {
    no: "Din vurdering hjelper barberen din å bli enda bedre.",
    en: "Your rating helps your barber get even better.",
  },
  "rate.thanks": { no: "Takk for tilbakemeldingen! 🙏", en: "Thanks for your feedback! 🙏" },
  "rate.thanksBody": { no: "Den hjelper oss å bli enda skarpere.", en: "It helps us get even sharper." },
  "rate.comment": { no: "Kommentar (valgfritt)", en: "Comment (optional)" },
  "rate.sending": { no: "Sender …", en: "Sending …" },
  "rate.send": { no: "Send vurdering", en: "Send rating" },
  "rate.stars": { no: "stjerner", en: "stars" },

  // ---- Min side (/min-side) ----
  "portal.notFoundTitle": { no: "Fant ikke siden", en: "Page not found" },
  "portal.linkInvalid": {
    no: "Lenken ser ut til å være ugyldig eller utløpt.",
    en: "The link seems to be invalid or expired.",
  },
  "portal.hi": { no: "Hei", en: "Hi" },
  "portal.memberSince": { no: "Din side · medlem siden", en: "Your page · member since" },
  "portal.loyalty": { no: "Klippekort", en: "Loyalty card" },
  "portal.rewardDue": { no: "Gratis klipp klart! 🎉", en: "Free haircut ready! 🎉" },
  "portal.rewardHint": {
    no: "Si ifra i kassen ved neste besøk, så trekker vi fra det gratis klippet.",
    en: "Let us know at the till on your next visit and we'll deduct the free haircut.",
  },
  "portal.moreVisits.pre": { no: "Kom", en: "Visit" },
  "portal.moreVisits.post": {
    no: "gang(er) til, så er neste klipp gratis.",
    en: "more time(s) and your next haircut is free.",
  },
  "portal.membership": { no: "Din medlemsstatus", en: "Your membership" },
  "portal.benefit": { no: "Ditt medlemsgode: ", en: "Your member benefit: " },
  "portal.spent": { no: "brukt", en: "spent" },
  "portal.completedVisits": { no: "fullførte besøk", en: "completed visits" },
  "portal.or": { no: "eller", en: "or" },
  "portal.visitsLeftTo": { no: "besøk igjen til", en: "visits left until" },
  "portal.topTier": { no: "Du er på vårt høyeste nivå 🏆", en: "You're at our highest tier 🏆" },
  "portal.spentWithUs": { no: "brukt hos oss", en: "spent with us" },
  "portal.history": { no: "Historikk", en: "History" },
  "portal.noHistory": { no: "Ingen tidligere timer enda.", en: "No previous appointments yet." },
  "portal.appointment": { no: "Time", en: "Appointment" },
  "portal.rebook": { no: "Book på nytt", en: "Book again" },
  "portal.downloadHistory": { no: "Last ned kjøpshistorikk (PDF)", en: "Download purchase history (PDF)" },
  "portal.upcoming": { no: "Kommende timer", en: "Upcoming appointments" },
  "portal.with": { no: "hos", en: "with" },
  "portal.reschedule": { no: "Endre tid", en: "Reschedule" },
  "portal.cancel": { no: "Avbestill", en: "Cancel" },
  "portal.cancelQ": { no: "Avbestille denne timen?", en: "Cancel this appointment?" },
  "portal.yesCancel": { no: "Ja, avbestill", en: "Yes, cancel" },
  "portal.noKeep": { no: "Nei, behold", en: "No, keep it" },
  "portal.newDate": { no: "Ny dato", en: "New date" },
  "portal.loadingSlots": { no: "Henter ledige tider …", en: "Loading available times …" },
  "portal.noSlotsDay": {
    no: "Ingen ledige tider denne dagen. Prøv en annen dato.",
    en: "No available times this day. Try another date.",
  },
  "portal.close": { no: "Lukk", en: "Close" },
  "portal.status.pending": { no: "Venter", en: "Pending" },
  "portal.status.confirmed": { no: "Bekreftet", en: "Confirmed" },
  "portal.status.completed": { no: "Fullført", en: "Completed" },
  "portal.status.cancelled": { no: "Avbestilt", en: "Cancelled" },
  "portal.status.no_show": { no: "Ikke møtt", en: "No-show" },
  "portal.msg.cancel.already": { no: "Timen er allerede avbestilt.", en: "This appointment is already cancelled." },
  "portal.msg.cancel.too_late": {
    no: "Timen kan ikke avbestilles på nett lenger. Ring oss på +47 463 58 764.",
    en: "This appointment can no longer be cancelled online. Call us on +47 463 58 764.",
  },
  "portal.msg.resched.too_late": {
    no: "Timen kan ikke endres på nett lenger. Ring oss på +47 463 58 764.",
    en: "This appointment can no longer be changed online. Call us on +47 463 58 764.",
  },
  "portal.msg.resched.past": { no: "Velg et tidspunkt fram i tid.", en: "Choose a time in the future." },
  "portal.msg.resched.taken": { no: "Den tiden ble nettopp opptatt. Velg en annen.", en: "That time was just taken. Choose another." },
  "portal.msg.resched.invalid": { no: "Ugyldig valg. Prøv en annen tid.", en: "Invalid choice. Try another time." },
  "portal.msg.not_found": {
    no: "Noe gikk galt. Last siden på nytt og prøv igjen.",
    en: "Something went wrong. Reload the page and try again.",
  },
  "portal.msg.error": { no: "Noe gikk galt. Prøv igjen om litt.", en: "Something went wrong. Try again shortly." },

  // ---- Avbestilling (/avbestill) ----
  "cancelpage.ok.h": { no: "Timen er avbestilt ✓", en: "Appointment cancelled ✓" },
  "cancelpage.ok.p": {
    no: "Takk for at du ga oss beskjed. Velkommen tilbake en annen gang!",
    en: "Thanks for letting us know. Welcome back another time!",
  },
  "cancelpage.already.h": { no: "Allerede avbestilt", en: "Already cancelled" },
  "cancelpage.already.p": { no: "Denne timen er allerede avbestilt.", en: "This appointment is already cancelled." },
  "cancelpage.too_late.h": { no: "For sent å avbestille", en: "Too late to cancel" },
  "cancelpage.too_late.p": {
    no: "Timen har allerede vært, eller er i gang. Ta kontakt med oss om noe er feil.",
    en: "The appointment has already taken place or is in progress. Contact us if something is wrong.",
  },
  "cancelpage.not_found.h": { no: "Fant ikke timen", en: "Appointment not found" },
  "cancelpage.title": { no: "Avbestille time?", en: "Cancel appointment?" },
  "cancelpage.service": { no: "Tjeneste", en: "Service" },
  "cancelpage.barber": { no: "Barber", en: "Barber" },
  "cancelpage.time": { no: "Tid", en: "Time" },
  "cancelpage.pastNote": {
    no: "Denne timen kan ikke avbestilles på nett lenger. Ta kontakt med oss på +47 463 58 764.",
    en: "This appointment can no longer be cancelled online. Contact us on +47 463 58 764.",
  },
  "cancelpage.yes": { no: "Ja, avbestill timen", en: "Yes, cancel the appointment" },
  "cancelpage.no": { no: "Nei, behold timen", en: "No, keep the appointment" },

  // ---- Footer / personvern ----
  "footer.openMap": { no: "Åpne i Google Maps", en: "Open in Google Maps" },
  "footer.privacy": { no: "Personvern", en: "Privacy" },
  "wiz.privacyNote.pre": {
    no: "Ved å bestille godtar du at vi lagrer opplysningene dine for å håndtere timen. Les mer i ",
    en: "By booking you accept that we store your details to manage the appointment. Read more in our ",
  },
  "wiz.privacyNote.link": { no: "personvernerklæringen", en: "privacy policy" },
  "wiz.privacyNote.post": { no: ".", en: "." },
  // ---- Booking v2: ett valg per trykk ----
  "wiz.pickOne": { no: "Trykk på det du vil ha – du kan legge til mer etterpå.", en: "Tap what you want – you can add more afterwards." },
  "wiz.choose": { no: "Velg", en: "Choose" },
  "wiz.selected": { no: "Valgt", en: "Selected" },
  "wiz.changeService": { no: "Endre tjeneste", en: "Change service" },
  "wiz.changeBarber": { no: "Endre barber", en: "Change barber" },
  "wiz.changeTime": { no: "Endre tid", en: "Change time" },
  "wiz.addonsOptional": { no: "Vil du legge til noe? (valgfritt)", en: "Anything extra? (optional)" },
  "wiz.addAnother": { no: "Legg til en tjeneste til (f.eks. for en til person)", en: "Add another service (e.g. for another person)" },
  "wiz.addingBanner": { no: "Velg tjenesten du vil legge til. Allerede valgt:", en: "Choose the service to add. Already selected:" },
  "wiz.cancelAdd": { no: "Avbryt", en: "Cancel" },
  "wiz.anyBarberWhy": { no: "Raskest – flest ledige tider", en: "Fastest – most available times" },
  "wiz.addNote": { no: "Legg til en beskjed til barberen", en: "Add a note for the barber" },
  "wiz.remembered": { no: "Vi har fylt inn opplysningene fra sist.", en: "We filled in your details from last time." },
  "wiz.notYou": { no: "Ikke deg?", en: "Not you?" },
  "wiz.swapTo": { no: "Bytt til", en: "Switch to" },
  "wiz.addPerson": { no: "Legg til for en person til", en: "Add for another person" },
  "wiz.addingFor": { no: "Velg tjeneste for person", en: "Choose a service for person" },
};
