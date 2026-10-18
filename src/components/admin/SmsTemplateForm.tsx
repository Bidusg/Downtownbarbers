"use client";

import { useRef, useState, useTransition } from "react";
import { saveSmsTemplates, sendTemplateTestSms } from "@/app/admin/integrasjoner/actions";
import {
  DEFAULT_SMS_TEMPLATES,
  SMS_VARIABLES,
  renderSms,
  smsParts,
  type SmsTemplates,
} from "@/lib/sms-templates";

const EXAMPLE = Object.fromEntries(SMS_VARIABLES.map((v) => [v.key, v.example]));

/** Én SMS-tekst: tekstfelt, variabel-knapper, forhåndsvisning og tegnteller. */
function TemplateEditor({
  title,
  hint,
  value,
  onChange,
  defaultText,
  disabled = false,
  toggle,
  onTest,
  pending,
}: {
  title: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  defaultText: string;
  disabled?: boolean;
  toggle?: React.ReactNode;
  onTest: (text: string) => void;
  pending: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const preview = renderSms(value, EXAMPLE);
  const info = smsParts(preview);

  function insert(key: string) {
    const el = ref.current;
    const token = `{${key}}`;
    if (!el) return onChange(value + token);
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    onChange(value.slice(0, s) + token + value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  }

  return (
    <div className={"space-y-3 rounded-lg border border-line p-4 " + (disabled ? "opacity-60" : "")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-fg">{title}</p>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        {toggle}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        maxLength={600}
        className="w-full resize-y rounded-md border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Sett inn:</span>
        {SMS_VARIABLES.map((v) => (
          <button key={v.key} type="button" className="act" onClick={() => insert(v.key)}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="rounded-md bg-surface-2 p-3">
        <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">
          Slik ser den ut for kunden
        </p>
        <p className="text-sm whitespace-pre-line text-fg">{preview || "—"}</p>
        <p className={"mt-2 text-xs " + (info.parts > 1 ? "text-danger" : "text-muted")}>
          {info.chars} tegn · {info.parts} SMS{info.parts > 1 ? " (betales per del)" : ""}
          {info.unicode && " · inneholder emoji/spesialtegn – da blir grensen 70 tegn"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="act"
          disabled={value.trim() === defaultText}
          onClick={() => onChange(defaultText)}
        >
          Tilbakestill til standard
        </button>
        <button type="button" className="act" disabled={pending} onClick={() => onTest(value)}>
          Send denne som test
        </button>
      </div>
    </div>
  );
}

export function SmsTemplateForm({ initial }: { initial: SmsTemplates }) {
  const [confirmation, setConfirmation] = useState(initial.confirmation);
  const [confirmationEnabled, setConfirmationEnabled] = useState(initial.confirmationEnabled);
  const [reminder, setReminder] = useState(initial.reminder);
  const [to, setTo] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    confirmation.trim() !== initial.confirmation.trim() ||
    reminder.trim() !== initial.reminder.trim() ||
    confirmationEnabled !== initial.confirmationEnabled;

  const test = (text: string) =>
    start(async () => {
      setMsg(null);
      if (!to.trim()) return setMsg({ ok: false, text: "Skriv inn ditt nummer i feltet nederst først." });
      const r = await sendTemplateTestSms(text, to);
      setMsg({ ok: r.ok, text: r.message });
    });

  return (
    <div className="space-y-4">
      <TemplateEditor
        title="Bekreftelse"
        hint="Sendes rett etter at kunden har booket (nett og kasse). Ikke for timer som legges inn i etterkant."
        value={confirmation}
        onChange={setConfirmation}
        defaultText={DEFAULT_SMS_TEMPLATES.confirmation}
        disabled={!confirmationEnabled}
        onTest={test}
        pending={pending}
        toggle={
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={confirmationEnabled}
              onChange={(e) => setConfirmationEnabled(e.target.checked)}
              className="accent-[#F47721]"
            />
            Send bekreftelse på SMS
          </label>
        }
      />
      <TemplateEditor
        title="Påminnelse"
        hint="Sendes dagen før timen."
        value={reminder}
        onChange={setReminder}
        defaultText={DEFAULT_SMS_TEMPLATES.reminder}
        onTest={test}
        pending={pending}
      />

      {msg && <p className={"text-sm " + (msg.ok ? "text-accent-soft" : "text-danger")}>{msg.text}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="act act-accent"
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const fd = new FormData();
              fd.set("confirmation", confirmation);
              fd.set("confirmationEnabled", confirmationEnabled ? "true" : "false");
              fd.set("reminder", reminder);
              const r = await saveSmsTemplates(fd);
              setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Lagret ✓" });
            })
          }
        >
          {pending ? "Lagrer …" : "Lagre tekstene"}
        </button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        <span className="text-xs text-muted">Test sendes til:</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="+47 …"
          inputMode="tel"
          className="w-36 rounded-md border border-line-2 bg-canvas px-2 py-1.5 text-sm text-fg"
          aria-label="Mottaker for test"
        />
      </div>
    </div>
  );
}
