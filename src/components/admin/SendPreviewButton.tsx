"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { previewMarketingSend, type SendPreview } from "@/app/admin/markedsforing/actions";

/** «Vis»-knapp i «Sendt før»: popup med e-posten/SMS-en slik kundene fikk den. */
export function SendPreviewButton({ sendId, subject }: { sendId: string; subject: string }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<"no" | "en">("no");
  const [data, setData] = useState<SendPreview | null>(null);
  const [pending, start] = useTransition();

  function load(l: "no" | "en") {
    setLang(l);
    start(async () => setData(await previewMarketingSend(sendId, l)));
  }

  function show() {
    setOpen(true);
    setData(null);
    load("no");
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const tab = (on: boolean) =>
    "rounded-md px-2.5 py-1 text-xs font-semibold " + (on ? "bg-fg text-canvas" : "text-muted hover:text-fg");

  return (
    <>
      <button type="button" onClick={show} className="act" aria-label={`Forhåndsvis «${subject}»`}>
        Forhåndsvis
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-6"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-preview-title"
          >
            <div
              className="flex h-[calc(100dvh-1.5rem)] w-full max-w-[700px] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-2xl sm:h-[calc(100dvh-3rem)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    Forhåndsvisning{data?.channel === "sms" ? " · SMS" : data?.channel === "email" ? " · E-post" : ""}
                  </p>
                  <h3 id="send-preview-title" className="truncate font-display text-lg font-bold text-fg">
                    {data?.subject ?? subject}
                  </h3>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {data?.hasEn && (
                    <div className="flex gap-1 rounded-lg border border-line p-0.5" role="group" aria-label="Språk">
                      <button type="button" className={tab(lang === "no")} onClick={() => load("no")} aria-pressed={lang === "no"}>
                        Norsk
                      </button>
                      <button type="button" className={tab(lang === "en")} onClick={() => load("en")} aria-pressed={lang === "en"}>
                        English
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Lukk"
                    className="px-2 text-2xl leading-none text-muted hover:text-fg"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="relative min-h-0 flex-1 bg-[#ECE7DF]">
                {pending && !data ? (
                  <p className="p-6 text-sm text-muted">Laster …</p>
                ) : data && !data.ok ? (
                  <p className="p-6 text-sm text-danger">{data.error ?? "Kunne ikke vise utsendingen."}</p>
                ) : data?.channel === "sms" ? (
                  <div className="flex h-full items-start justify-center overflow-auto p-6">
                    <div className="max-w-sm whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-white px-4 py-3 text-[15px] leading-relaxed text-[#211E1A] shadow">
                      {data.sms}
                    </div>
                  </div>
                ) : data?.html ? (
                  <iframe
                    title="Forhåndsvisning av e-posten"
                    srcDoc={data.html}
                    sandbox="allow-popups"
                    className={"h-full w-full border-0 bg-white transition-opacity " + (pending ? "opacity-50" : "")}
                  />
                ) : null}
              </div>
              <p className="border-t border-line px-5 py-2 text-[11px] text-muted">
                Slik kundene fikk den. Avmeldings- og språklenken virker ikke her.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
