import type { Notice, NoticeLevel } from "@/lib/notices-queries";

/**
 * Presentasjonskomponent som viser aktive driftsmeldinger som banner,
 * fargekodet etter nivå. Returnerer null når det ikke er noen meldinger.
 * (Selve innplasseringen i layoutene håndteres andre steder.)
 */

const LEVEL_STYLE: Record<NoticeLevel, string> = {
  info: "border-line bg-surface text-fg",
  warning: "border-accent-soft/40 bg-accent-soft/10 text-fg",
  critical: "border-danger/40 bg-danger/10 text-fg",
};

const LEVEL_DOT: Record<NoticeLevel, string> = {
  info: "text-muted",
  warning: "text-accent-soft",
  critical: "text-danger",
};

const LEVEL_LABEL: Record<NoticeLevel, string> = {
  info: "Info",
  warning: "Viktig",
  critical: "Kritisk",
};

export function NoticeBanner({ notices }: { notices: Notice[] }) {
  if (!notices || notices.length === 0) return null;

  return (
    <div className="space-y-2">
      {notices.map((n) => {
        const level: NoticeLevel = n.level ?? "info";
        return (
          <div
            key={n.id}
            className={`flex items-start gap-3 border px-4 py-3 text-sm ${LEVEL_STYLE[level]}`}
          >
            <span className={`mt-0.5 ${LEVEL_DOT[level]}`} aria-hidden>
              ●
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <strong className="font-semibold">{n.title}</strong>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${LEVEL_DOT[level]}`}
                >
                  {LEVEL_LABEL[level]}
                </span>
              </p>
              {n.body && (
                <p className="mt-1 whitespace-pre-line text-muted">{n.body}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
