# E-post som havner i søppelpost

Alt vi sender – ordrebekreftelser, påminnelser, innloggingskoder, nyhetsbrev –
går gjennom Resend. Når alt havner i spam, er det nesten alltid én av fire
grunner, og de første tre ligger i DNS og miljøvariabler, ikke i koden.

## Start her: admin → Integrasjoner → «Feilsøk e-post»

Den sjekker nå automatisk:

- om `EMAIL_FROM` er satt, eller om vi fortsatt sender fra Resend sin
  testavsender (`onboarding@resend.dev`),
- om nyhetsbrev sendes fra en annen avsender enn bekreftelsene,
- **SPF, DKIM og DMARC på avsenderdomenet**, med den eksakte verdien som
  mangler,
- og den sender en ekte test-e-post og henter leveringsstatusen fra Resend –
  inkludert om adressen står på Resend sin sperreliste.

Kjør den først. Den sier hvilken av punktene under som er problemet.

---

## 1. Avsenderdomenet må være verifisert

Sender vi fra `onboarding@resend.dev`, går det ikke frem til kunder i det hele
tatt – Resend sin testavsender kan bare sende til e-posten kontoen er
registrert med.

1. Resend → **Domains** → legg inn `downtownbarbers.no`.
2. Legg de tre postene Resend oppgir inn hos domeneleverandøren:
   - `TXT` på `send.downtownbarbers.no` → `v=spf1 include:amazonses.com ~all`
   - `MX` på `send.downtownbarbers.no` → `feedback-smtp.<region>.amazonses.com` (prioritet 10)
   - `TXT` på `resend._domainkey.downtownbarbers.no` → DKIM-nøkkelen fra Resend
3. I Vercel: `EMAIL_FROM = Downtown Barbers <post@downtownbarbers.no>` → redeploy.

**DKIM er den viktigste.** Uten signatur sorteres e-posten som søppelpost
nesten uansett hva den inneholder.

## 2. DMARC må finnes

Gmail og Yahoo krever siden 2024 at alle som sender i volum har DMARC. Uten
den filtreres vi hardere, uavhengig av innholdet.

`TXT` på `_dmarc.downtownbarbers.no`:

```
v=DMARC1; p=none; rua=mailto:post@downtownbarbers.no
```

`p=none` overvåker bare og blokkerer ingenting – riktig å starte med. Når
rapportene viser at alt vi sender passerer, kan den strammes til
`p=quarantine`.

## 3. Nyhetsbrev og bekreftelser må ha ulike avsendere

Dette er den mest sannsynlige årsaken hos oss nå, etter kampanjeutsendelsene.

Når kampanjer og bekreftelser kommer fra **samme** adresse, drar hver kunde som
trykker «søppelpost» på et nyhetsbrev også ordrebekreftelser, kvitteringer og
innloggingskoder med seg ned i filteret – for alle. Omdømmet er knyttet til
avsenderdomenet, ikke til innholdet.

Fiks: eget subdomene for markedsføring, verifisert i Resend på samme måte:

```
EMAIL_FROM_MARKETING = Downtown Barbers <nyheter@nyhetsbrev.downtownbarbers.no>
```

Da kan nyhetsbrevet ta støyten uten å ta kvitteringene med seg.

## 4. Oppvarming av et nytt domene

Et domene som aldri har sendt e-post før, og som plutselig sender flere hundre
kampanjer, blir filtrert nettopp fordi det er nytt. Det er ikke noe galt med
koden – mottakerne har bare ingen historikk å stole på.

- Send de første ukene til kunder som faktisk åpner: de nyeste først.
- Trapp opp. Noen hundre om dagen, ikke alt på én gang.
- Rydd listen. Hver avvisning (`bounced`) og hver søppelpost-merking
  (`complained`) teller mot oss.
- Fjern adresser fra Resend → **Suppressions** bare når du vet hvorfor de
  havnet der.

---

## Dette er alt gjort i koden

- **Ren tekst-versjon** følger med hver e-post. Bare HTML scorer dårligere hos
  filtrene, og er uleselig i klienter som viser tekst.
- **`List-Unsubscribe` og ett-klikks avmelding** på alle masseutsendelser –
  også et Gmail/Yahoo-krav.
- **`EMAIL_REPLY_TO`** gir kundene en adresse de kan svare på. En avsender som
  ikke kan svares på leses som automatikk.
- **Egen avsender for markedsføring** er støttet; den trenger bare å settes.

## Det som ikke er gjort

Setter du `EMAIL_FROM_MARKETING` til et nytt subdomene, må subdomenet
verifiseres i Resend for seg – det arver ikke DKIM-nøkkelen fra hoveddomenet.
Feilsøkingen i admin sjekker foreløpig bare DNS på avsenderen for
bekreftelser, ikke på markedsføringsdomenet.
