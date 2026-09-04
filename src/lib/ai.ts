/**
 * AI-tekst via Anthropic (Claude). Brukes til å skrive personlige
 * oppfølgings-e-poster. Faller elegant tilbake til en fast, on-brand mal
 * hvis ANTHROPIC_API_KEY ikke er satt eller kallet feiler – slik at
 * oppfølging fungerer uansett, og blir «smartere» når nøkkelen er på plass.
 */

export type FollowupCopy = { subject: string; intro: string };

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

function fallbackCopy(firstName: string, service: string | null): FollowupCopy {
  return {
    subject: "Klar for en ny tur i stolen? 💈",
    intro: `Hei ${firstName}! Det har gått en liten stund siden sist${
      service ? ` du var innom for ${service.toLowerCase()}` : ""
    }. Vi vil gjerne se deg igjen – book en ny time når det passer deg.`,
  };
}

function extractJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text);
}

export async function generateFollowupCopy(opts: {
  name: string;
  service: string | null;
  weeksSince: number;
}): Promise<FollowupCopy> {
  const first = opts.name.trim().split(/\s+/)[0] || opts.name.trim() || "der";
  const fallback = fallbackCopy(first, opts.service);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fallback;

  try {
    const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        system:
          "Du skriver korte, varme e-poster på norsk (bokmål) for Downtown Barbers, en barbershop i Oslo. Tonen er stilig, vennlig og uanstrengt – aldri masete eller salgsaktig. Svar KUN med gyldig JSON, ingen forklaring.",
        messages: [
          {
            role: "user",
            content:
              `Skriv en kort oppfølgings-e-post til en kunde som ikke har booket time på ${opts.weeksSince} uker.\n` +
              `Kundens fornavn: ${first}\n` +
              `Siste tjeneste: ${opts.service ?? "ukjent"}\n\n` +
              `Målet er å vennlig minne dem på å booke ny time. Maks to korte setninger i "intro". ` +
              `Ikke inkluder hilsen, signatur eller lenke – det legges til automatisk.\n` +
              `Svar med JSON på formen: {"subject": "...", "intro": "..."}`,
          },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const parsed = extractJson(text) as { subject?: unknown; intro?: unknown };
    if (parsed && typeof parsed.subject === "string" && typeof parsed.intro === "string") {
      return { subject: parsed.subject, intro: parsed.intro };
    }
    return fallback;
  } catch {
    return fallback;
  }
}
