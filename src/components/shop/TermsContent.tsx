import Link from "next/link";
import { getSiteSettings } from "@/lib/site-settings";

/** Fyll inn organisasjonsnummeret (vises bare når det er satt). */
const ORG_NR = "";

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 text-xl font-semibold tracking-tight">{children}</h2>;
}

/**
 * Selve kjøpsvilkårene. Brukes på /kjopsvilkar og i kassen (åpnes i et
 * vindu over handlekurven, så kunden ikke mister det de har fylt ut).
 */
export async function TermsContent() {
  const s = await getSiteSettings();
  const email = s.email ?? "contact@downtownbarbers.no";
  return (
    <div className="text-[15px] leading-relaxed text-fg-soft [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <p>
          Disse vilkårene gjelder når du kjøper varer i nettbutikken vår. Kjøpet er regulert av forbrukerkjøpsloven,
          angrerettloven, e-handelsloven og markedsføringsloven, og du har alltid minst de rettighetene lovene gir deg.
        </p>

        <H>1. Selger</H>
        <p>
          {s.name || "Downtown Barbers"}
          {ORG_NR && <> · Org.nr. {ORG_NR}</>}
          <br />
          {s.address}
          <br />
          E-post: <a className="underline" href={`mailto:${email}`}>{email}</a> · Telefon: {s.phone}
        </p>

        <H>2. Priser</H>
        <p>
          Alle priser er i norske kroner og inkluderer 25 % merverdiavgift. Frakt vises før du betaler. Medlemmer i
          kundeklubben får rabatten sin trukket automatisk når de er innlogget.
        </p>

        <H>3. Bestilling og avtale</H>
        <p>
          Avtalen er bindende når du har fullført bestillingen og fått ordrebekreftelse på e-post. Sjekk at bekreftelsen
          stemmer, og si fra med en gang hvis noe er feil. Er en vare utsolgt etter at du har bestilt, gir vi beskjed og
          trekker ikke betalingen for den.
        </p>

        <H>4. Betaling</H>
        <ul>
          <li>
            <strong>Vipps (og kort via Vipps):</strong> beløpet reserveres når du bestiller, og trekkes først når varene er
            utlevert i salongen eller sendt.
          </li>
          <li>
            <strong>Betal ved henting:</strong> du betaler med kort, Vipps eller kontant når du henter. Ordren holdes av i
            7 dager.
          </li>
        </ul>

        <H>5. Levering</H>
        <ul>
          <li>
            <strong>Hent i salongen</strong> ({s.address}): gratis. Du får e-post når ordren er klar, som regel samme dag
            i åpningstiden. Ta med ordrenummeret.
          </li>
          <li>
            <strong>Sending med Posten:</strong> vi sender normalt innen 1–2 virkedager, og leveringstiden er vanligvis 2–5
            virkedager. Du får sporingsnummer på e-post. Risikoen for varen går over på deg når du har fått den.
          </li>
        </ul>

        <H>6. Angrerett – 14 dager</H>
        <p>
          Du kan angre kjøpet uten å oppgi grunn innen 14 dager etter at du fikk varen. Gi oss beskjed på e-post (gjerne
          med angreskjemaet fra{" "}
          <a className="underline" href="https://www.forbrukertilsynet.no/angrerett" target="_blank" rel="noreferrer">
            Forbrukertilsynet
          </a>
          ) innen fristen, og send eller lever varen tilbake senest 14 dager etter at du ga beskjed. Vi betaler tilbake
          hele beløpet, inkludert vanlig frakt, senest 14 dager etter at vi fikk beskjed – men vi kan vente til vi har
          fått varen tilbake. Du betaler selv returfrakten.
        </p>
        <p>
          <strong>Unntak:</strong> av hygienehensyn gjelder ikke angreretten forseglede pleieprodukter (for eksempel voks,
          olje, sjampo og barberprodukter) der forseglingen er brutt etter levering. Varen kan prøves slik man ville gjort i
          en butikk, men er den brukt mer enn det, kan vi trekke for verdiforringelsen.
        </p>
        <p>
          <strong>Retur og bytte i salongen:</strong> det enkleste er å ta med varen og ordrenummeret til salongen i{" "}
          {s.address}. Vi registrerer returen eller byttet med en gang, og du får bekreftelse på e-post. Betalte du med
          Vipps eller kort, går pengene tilbake dit (det kan ta noen dager før de vises på kontoen).
        </p>

        <H>7. Reklamasjon</H>
        <p>
          Er det feil med varen, kan du reklamere innen rimelig tid etter at du oppdaget feilen – og senest 2 år etter at du
          fikk den (5 år for varer som er ment å vare vesentlig lenger, som enkelte barbermaskiner). Ta kontakt på e-post
          eller i salongen, så finner vi en løsning: retting, ny vare, prisavslag eller heving etter forbrukerkjøpsloven.
          Vi dekker returkostnaden ved berettiget reklamasjon.
        </p>

        <H>8. Personopplysninger</H>
        <p>
          Vi bruker navn, kontaktinfo og adresse bare til å behandle ordren, sende varen og oppfylle regnskapsplikten. Les
          mer i{" "}
          <Link href="/personvern" className="underline">
            personvernerklæringen
          </Link>
          .
        </p>

        <H>9. Tvister</H>
        <p>
          Ta kontakt med oss først – vi løser det aller meste raskt. Kommer vi ikke til enighet, kan du klage til{" "}
          <a className="underline" href="https://www.forbrukertilsynet.no" target="_blank" rel="noreferrer">
            Forbrukertilsynet
          </a>{" "}
          og få saken behandlet i Forbrukerklageutvalget.
        </p>
        <p className="mt-10 text-sm text-muted">Sist oppdatert: oktober 2026.</p>
    </div>
  );
}
