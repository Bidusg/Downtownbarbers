/**
 * AI-tekst for personlige oppfølgings-e-poster. Leverandør-agnostisk:
 *
 *   1) OpenAI-kompatibelt endepunkt (Ollama, vLLM, OpenRouter, OpenAI …)
 *      hvis AI_BASE_URL er satt. Ollama: sett AI_BASE_URL til
 *      https://<din-ollama>/v1 og AI_MODEL til f.eks. "llama3.1".
 *      (AI_API_KEY er valgfri – Ollama trenger den ikke, hostede tjenester gjør.)
 *   2) Anthropic (Claude) hvis ANTHROPIC_API_KEY er satt.
 *   3) Fast, on-brand mal hvis ingenting er konfigurert eller kallet feiler.
 *
 * Slik fungerer oppfølging uansett, og blir «smartere» når en modell er koblet på.
 * NB: Vercel (serverless) kan ikke nå en Ollama som kjører på localhost –
 * endepunktet må være offentlig tilgjengelig (tunnel eller hostet).
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

const SYSTEM_PROMPT =
  "Du skriver korte, varme e-poster på norsk (bokmål) for Downtown Barbers, en barbershop i Oslo. Tonen er stilig, vennlig og uanstrengt – aldri masete eller salgsaktig. Svar KUN med gyldig JSON, ingen forklaring.";

function userPrompt(first: string, service: string | null, weeks: number): string {
  return (
    `Skriv en kort oppfølgings-e-post til en kunde som ikke har booket time på ${weeks} uker.\n` +
    `Kundens fornavn: ${first}\n` +
    `Siste tjeneste: ${service ?? "ukjent"}\n\n` +
    `Målet er å vennlig minne dem på å booke ny time. Maks to korte setninger i "intro". ` +
    `Ikke inkluder hilsen, signatur eller lenke – det legges til automatisk.\n` +
    `Svar med JSON på formen: {"subject": "...", "intro": "..."}`
  );
}

function coerce(parsed: unknown, fallback: FollowupCopy): FollowupCopy {
  const p = parsed as { subject?: unknown; intro?: unknown } | null;
  if (p && typeof p.subject === "string" && typeof p.intro === "string") {
    return { subject: p.subject, intro: p.intro };
  }
  return fallback;
}

/** OpenAI-kompatibelt chat/completions-kall (Ollama, vLLM, OpenAI m.fl.). */
async function viaOpenAICompatible(
  first: string,
  service: string | null,
  weeks: number,
  fallback: FollowupCopy,
): Promise<FollowupCopy> {
  const base = process.env.AI_BASE_URL!.replace(/\/$/, "");
  const model = process.env.AI_MODEL || "llama3.1";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.AI_API_KEY) {
    headers.Authorization = `Bearer ${process.env.AI_API_KEY}`;
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 300,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(first, service, weeks) },
      ],
    }),
  });
  if (!res.ok) return fallback;
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  if (!text) return fallback;
  return coerce(extractJson(text), fallback);
}

/** Anthropic (Claude) messages-kall. */
async function viaAnthropic(
  first: string,
  service: string | null,
  weeks: number,
  fallback: FollowupCopy,
): Promise<FollowupCopy> {
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(first, service, weeks) }],
    }),
  });
  if (!res.ok) return fallback;
  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";
  if (!text) return fallback;
  return coerce(extractJson(text), fallback);
}

export async function generateFollowupCopy(opts: {
  name: string;
  service: string | null;
  weeksSince: number;
}): Promise<FollowupCopy> {
  const first = opts.name.trim().split(/\s+/)[0] || opts.name.trim() || "der";
  const fallback = fallbackCopy(first, opts.service);

  try {
    if (process.env.AI_BASE_URL) {
      return await viaOpenAICompatible(
        first,
        opts.service,
        opts.weeksSince,
        fallback,
      );
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return await viaAnthropic(first, opts.service, opts.weeksSince, fallback);
    }
    return fallback;
  } catch {
    return fallback;
  }
}
