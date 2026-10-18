"use client";

import { useRef, useState, useTransition } from "react";
import { saveSmsTemplates, sendTemplateTestSms } from "@/app/admin/integrasjoner/actions";
import {
  DEFAULT_SMS_TEMPLATES,
  SMS_VARIABLES,
  renderSms,
  smsParts,
} from "@/lib/sms-templates";

/** Rediger påminnelses-SMS med variabler, forhåndsvisning og tegnteller. */
export function SmsTemplateForm({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [to, setTo] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const example = Object.fromEntries(SMS_VARIABLES.map((v) => [v.key, v.example]));
  const preview = renderSms(text, example);
  const info = smsParts(preview);
  const dirty = text.trim() !== initial.trim();

  function insert(key: string) {
    const el = ref.current;
    const token = `{${key}}`;
    if (!el) return setText((t) => t + token);
    const s = el.selectionStart ?? text.length;
    const e = el.selectionEnd ?? text.length;
    const next = text.slice(0, s) + token + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
          Påminnelse (sendes dagen før timen)
        </p>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={600}
          className="w-full resize-y rounded-md border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Sett inn:</span>
          {SMS_VARIABLES.map((v) => (
            <button key={v.key} type="button" className="act" onClick={() => insert(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-surface-2 p-4">
        <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
          Slik ser den ut for kunden
        </p>
        <p className="text-sm whitespace-pre-line text-fg">{preview || "—"}</p>
        <p className={"mt-2 text-xs " + (info.parts > 1 ? "text-danger" : "text-muted")}>
          {info.chars} tegn · {info.parts} SMS{info.parts > 1 ? " (betales per del)" : ""}
          {info.unicode && " · inneholder emoji/spesialtegn – da blir grensen 70 tegn"}
        </p>
      </div>

      {msg && (
        <p className={"text-sm " + (msg.ok ? "text-accent-soft" : "text-danger")}>{msg.text}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="act act-accent"
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const fd = new FormData();
              fd.set("reminder", text);
              const r = await saveSmsTemplates(fd);
              setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Lagret ✓" });
            })
          }
        >
          {pending ? "Lagrer …" : "Lagre tekst"}
        </button>
        <button
          type="button"
          className="act"
          disabled={pending || text.trim() === DEFAULT_SMS_TEMPLATES.reminder}
          onClick={() => setText(DEFAULT_SMS_TEMPLATES.reminder)}
        >
          Tilbakestill til standard
        </button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="+47 …"
          inputMode="tel"
          className="w-36 rounded-md border border-line-2 bg-canvas px-2 py-1.5 text-sm text-fg"
          aria-label="Mottaker for test"
        />
        <button
          type="button"
          className="act"
          disabled={pending || !to.trim()}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await sendTemplateTestSms(text, to);
              setMsg({ ok: r.ok, text: r.message });
            })
          }
        >
          Send test til meg
        </button>
      </div>
    </div>
  );
}
