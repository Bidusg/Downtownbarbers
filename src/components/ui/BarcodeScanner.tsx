"use client";

import { useEffect, useRef, useState } from "react";

type DetectedBarcode = { rawValue: string };
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
}

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"];

/**
 * Gjenbrukbar strekkode-skanner. Fungerer på iPad uten ekstra maskinvare:
 *  • Kamera via BarcodeDetector (når nettleseren støtter det).
 *  • Tekstfelt som fanger keyboard-skanner (skriver kode + Enter) eller manuell
 *    inntasting – alltid tilgjengelig som fallback.
 * onScan kalles med den skannede/innskrevne koden.
 */
export function BarcodeScanner({
  onScan,
  autoFocus = true,
}: {
  onScan: (code: string) => void;
  autoFocus?: boolean;
}) {
  const [manual, setManual] = useState("");
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const supported = typeof window !== "undefined" && !!getDetectorCtor();

  // Kamera-skanning: start strøm + detektor-løkke mens camOn er på.
  useEffect(() => {
    if (!camOn) return;
    const Ctor = getDetectorCtor();
    if (!Ctor) return; // knappen vises kun når støttet – dette er en sikkerhetssjekk
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const detector = new Ctor({ formats: FORMATS });

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        timer = setInterval(async () => {
          const el = videoRef.current;
          if (!el || el.readyState < 2) return;
          try {
            const found = await detector.detect(el);
            const code = found[0]?.rawValue?.trim();
            if (code) {
              stopped = true;
              if (timer) clearInterval(timer);
              onScan(code);
              setCamOn(false);
            }
          } catch {
            // enkelt-frame-feil ignoreres
          }
        }, 350);
      } catch {
        setCamErr("Fikk ikke tilgang til kamera.");
        setCamOn(false);
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [camOn, onScan]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    onScan(code);
    setManual("");
  }

  return (
    <div className="space-y-2">
      <form onSubmit={submitManual} className="flex items-center gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          autoFocus={autoFocus}
          placeholder="Skann eller skriv strekkode …"
          inputMode="text"
          aria-label="Strekkode"
          className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted outline-none focus:border-accent-soft"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg hover:opacity-90"
        >
          OK
        </button>
        {supported && (
          <button
            type="button"
            onClick={() => {
              setCamErr(null);
              setCamOn((v) => !v);
            }}
            className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-fg hover:border-accent-soft"
          >
            {camOn ? "Stopp" : "📷 Kamera"}
          </button>
        )}
      </form>

      {camOn && (
        <div className="overflow-hidden rounded-md border border-line bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            className="mx-auto max-h-64 w-full object-contain"
          />
        </div>
      )}
      {camErr && <p className="text-xs text-danger">{camErr}</p>}
      {!supported && (
        <p className="text-[11px] text-muted">
          Tips: en USB/Bluetooth-strekkodeleser skriver rett i feltet – bare skann.
        </p>
      )}
    </div>
  );
}
