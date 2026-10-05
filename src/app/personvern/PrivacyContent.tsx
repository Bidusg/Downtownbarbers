"use client";

import { useLanguage } from "@/lib/i18n/LanguageProvider";

/**
 * Personvernerklæring (NO/EN). Teksten beskriver hvordan systemet FAKTISK
 * behandler opplysninger (booking, kasse, min-side, markedsføring, cookies).
 * Oppdater datoen nederst når innholdet endres.
 */
export function PrivacyContent({
  company,
  address,
  email,
  phone,
}: {
  company: string;
  address: string;
  email: string;
  phone: string;
}) {
  const { lang } = useLanguage();
  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="mt-10 font-display text-xl font-bold">{children}</h2>
  );
  const P = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-3 text-sm leading-relaxed text-fg-soft">{children}</p>
  );
  const UL = ({ items }: { items: React.ReactNode[] }) => (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-fg-soft">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );

  if (lang === "en") {
    return (
      <article>
        <p className="text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">Privacy</p>
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1]">Privacy policy</h1>
        <P>
          {company} (Osterhaus&apos; gate 10, Oslo) is the data controller for the personal data we
          process when you book an appointment, buy something in the salon, use “My page” or receive
          marketing from us. This page explains what we collect, why, and your rights.
        </P>

        <H>What we collect</H>
        <UL
          items={[
            <><strong>Booking:</strong> name, email, phone number, chosen service/barber/time, optionally how you heard about us, and whether you ticked the marketing box.</>,
            <><strong>Purchases in the salon:</strong> what was bought, amount, payment method and which barber served you – linked to your customer record if you gave your phone or email.</>,
            <><strong>My page / cancellation links:</strong> a personal link (token) in your confirmation email that shows your appointments, loyalty card and purchase history. Anyone with the link can see it – do not forward it.</>,
            <><strong>Reviews:</strong> star rating and optional comment after a visit.</>,
            <><strong>Technical:</strong> a login cookie for staff, and your language choice stored in your own browser (localStorage). We do not use analytics or advertising cookies.</>,
          ]}
        />

        <H>Why, and on what legal basis</H>
        <UL
          items={[
            <><strong>To deliver the appointment</strong> (confirmation, reminders, changes, cancellation) – performance of a contract.</>,
            <><strong>To keep accounts</strong> – sales are retained for five years under the Norwegian Bookkeeping Act (legal obligation).</>,
            <><strong>Marketing by email/SMS</strong> – only with your consent; every message has an unsubscribe link, and replying STOP to an SMS unsubscribes you.</>,
            <><strong>Loyalty card and member levels</strong> – based on your visits and purchases, to give you the benefits (legitimate interest / contract).</>,
          ]}
        />

        <H>Who processes data for us</H>
        <P>
          We use trusted providers that process data on our behalf under data processing agreements:
          Supabase (database and file storage), Vercel (hosting), Resend (email), an SMS provider when
          enabled, and Tripletex (accounting – receives daily sales totals, not customer details). We do
          not sell personal data.
        </P>

        <H>How long we keep it</H>
        <P>
          Customer and booking data for as long as you are a customer. Sales records for five years
          (bookkeeping). If you ask us to delete you, we anonymise your customer record – sales rows
          are kept without any link to you.
        </P>

        <H>Your rights</H>
        <P>
          You can ask for access, correction, deletion (anonymisation), a copy of your data
          (portability), and you can withdraw marketing consent at any time. Contact us at{" "}
          <a href={`mailto:${email}`} className="underline underline-offset-2">{email}</a> or{" "}
          {phone}. You can also complain to Datatilsynet (the Norwegian Data Protection Authority).
        </P>

        <H>Cookies</H>
        <P>
          Only strictly necessary cookies: a login cookie for staff who sign in. Your NO/EN choice is
          stored in your browser. Fonts and the map link are served without contacting third parties
          until you click the map.
        </P>

        <p className="mt-10 text-xs text-muted">Last updated 5 October 2026 · {address}</p>
      </article>
    );
  }

  return (
    <article>
      <p className="text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">Personvern</p>
      <h1 className="mt-4 font-display text-4xl font-bold leading-[1]">Personvernerklæring</h1>
      <P>
        {company} (Osterhaus&apos; gate 10, Oslo) er behandlingsansvarlig for personopplysningene vi
        behandler når du bestiller time, handler i salongen, bruker «Min side» eller mottar
        markedsføring fra oss. Her står hva vi samler inn, hvorfor, og hvilke rettigheter du har.
      </P>

      <H>Hva vi samler inn</H>
      <UL
        items={[
          <><strong>Booking:</strong> navn, e-post, telefonnummer, valgt tjeneste/barber/tid, eventuelt hvordan du hørte om oss, og om du huket av for markedsføring.</>,
          <><strong>Kjøp i salongen:</strong> hva som ble kjøpt, beløp, betalingsmåte og hvilken barber som betjente deg – koblet til kundekortet ditt hvis du oppga telefon eller e-post.</>,
          <><strong>Min side / avbestillingslenke:</strong> en personlig lenke (token) i bekreftelses-e-posten som viser timene dine, klippekortet og kjøpshistorikk. Alle som har lenken kan se den – ikke videresend den.</>,
          <><strong>Vurderinger:</strong> stjerner og eventuell kommentar etter et besøk.</>,
          <><strong>Teknisk:</strong> en innloggingscookie for ansatte, og språkvalget ditt lagret i din egen nettleser (localStorage). Vi bruker ikke analyse- eller annonsecookies.</>,
        ]}
      />

      <H>Hvorfor, og på hvilket grunnlag</H>
      <UL
        items={[
          <><strong>For å levere timen</strong> (bekreftelse, påminnelse, endring, avbestilling) – oppfyllelse av avtale.</>,
          <><strong>For å føre regnskap</strong> – salg oppbevares i fem år etter bokføringsloven (rettslig forpliktelse).</>,
          <><strong>Markedsføring på e-post/SMS</strong> – kun med ditt samtykke; hver utsending har avmeldingslenke, og svarer du STOPP på en SMS, meldes du av.</>,
          <><strong>Klippekort og medlemsnivå</strong> – utledes av besøkene og kjøpene dine for å gi deg fordelene (berettiget interesse / avtale).</>,
        ]}
      />

      <H>Hvem behandler data for oss</H>
      <P>
        Vi bruker leverandører som behandler data på våre vegne under databehandleravtale: Supabase
        (database og fillagring), Vercel (drift av nettsiden), Resend (e-post), en SMS-leverandør når
        den er aktivert, og Tripletex (regnskap – mottar dagstotaler for salg, ikke kundeopplysninger).
        Vi selger ikke personopplysninger.
      </P>

      <H>Hvor lenge vi lagrer</H>
      <P>
        Kunde- og bookingopplysninger så lenge du er kunde. Salgsregistreringer i fem år
        (bokføringsplikt). Ber du oss slette deg, anonymiserer vi kundekortet – salgsradene beholdes
        uten kobling til deg.
      </P>

      <H>Dine rettigheter</H>
      <P>
        Du kan be om innsyn, retting, sletting (anonymisering), kopi av dataene dine (dataportabilitet),
        og du kan trekke markedsføringssamtykket når som helst. Kontakt oss på{" "}
        <a href={`mailto:${email}`} className="underline underline-offset-2">{email}</a> eller{" "}
        {phone}. Du kan også klage til Datatilsynet.
      </P>

      <H>Cookies</H>
      <P>
        Kun strengt nødvendige cookies: én innloggingscookie for ansatte som logger inn. Språkvalget
        NO/EN lagres i nettleseren din. Fonter og kartlenken leveres uten kontakt med tredjeparter før
        du selv klikker på kartet.
      </P>

      <p className="mt-10 text-xs text-muted">Sist oppdatert 5. oktober 2026 · {address}</p>
    </article>
  );
}
