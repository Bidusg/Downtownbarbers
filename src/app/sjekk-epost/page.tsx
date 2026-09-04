export const dynamic = "force-dynamic";
export default async function Page() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Downtown Barbers <onboarding@resend.dev>";
  let result = "";
  if (!key) {
    result = "NO KEY at runtime";
  } else {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: "kidus.fisseha002@gmail.com", subject: "Sjekk-epost test", html: "<p>test fra sjekk-epost</p>" }),
      });
      const body = await r.text();
      result = "status=" + r.status + " body=" + body.slice(0, 400);
    } catch (e) {
      result = "FETCH ERROR: " + String(e);
    }
  }
  return (
    <pre style={{ padding: 20, whiteSpace: "pre-wrap", fontSize: 14 }}>
      {"keyPresent: " + String(!!key) + " | prefix: " + (key ? key.slice(0,7) : "-") + " | from: " + from + "\n\n" + result}
    </pre>
  );
}
