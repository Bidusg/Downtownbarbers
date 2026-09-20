// «Legg til i kalender» – bygger en .ics-fil (data-URI, for Apple/Outlook) og
// en Google Calendar-lenke fra en booking. Ren funksjon, brukes på klienten.

function escapeICS(s: string): string {
  return s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}
function compactUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function eventLinks(opts: {
  title: string;
  start: Date;
  durationMin: number;
  description?: string;
  location?: string;
}): { icsHref: string; googleHref: string } {
  const end = new Date(opts.start.getTime() + opts.durationMin * 60000);
  const dtStart = compactUtc(opts.start);
  const dtEnd = compactUtc(end);
  const location = opts.location ?? "Downtown Barbers";
  const description = opts.description ?? "";

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Downtown Barbers//Booking//NO",
    "BEGIN:VEVENT",
    `UID:${dtStart}-downtownbarbers@booking`,
    `DTSTAMP:${compactUtc(new Date())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(opts.title)}`,
    description ? `DESCRIPTION:${escapeICS(description)}` : "",
    `LOCATION:${escapeICS(location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  const icsHref =
    "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);

  const g = new URL("https://calendar.google.com/calendar/render");
  g.searchParams.set("action", "TEMPLATE");
  g.searchParams.set("text", opts.title);
  g.searchParams.set("dates", `${dtStart}/${dtEnd}`);
  if (description) g.searchParams.set("details", description);
  g.searchParams.set("location", location);

  return { icsHref, googleHref: g.toString() };
}
