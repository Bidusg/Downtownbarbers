import { notFound } from "next/navigation";

// Tidligere en midlertidig e-post-diagnostikkside. Den lekket prefikset av
// RESEND_API_KEY og sendte test-e-post ved hvert besøk – uten innlogging.
// Nøytralisert til 404 før go-live. Behold fila som 404 (eller slett ruten helt).
export const dynamic = "force-dynamic";

export default function Page() {
  notFound();
}
