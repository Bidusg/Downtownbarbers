"use client";

import { useState, useTransition } from "react";
import type { CraftBlock } from "@/lib/site-images";
import {
  createCraft,
  saveCraftText,
  deleteCraft,
  toggleCraft,
  moveCraft,
} from "@/app/admin/nettside/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const inputCls =
  "w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft";

function BlockRow({
  block,
  isTop,
  isBottom,
}: {
  block: CraftBlock;
  isTop: boolean;
  isBottom: boolean;
}) {
  const [title, setTitle] = useState(block.title);
  const [body, setBody] = useState(block.body ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok?: true; error?: string }>) =>
    start(async () => {
      setMsg(null);
      setErr(false);
      const r = await fn();
      if (r.error) {
        setErr(true);
        setMsg(r.error);
      }
    });

  const dirty = title !== block.title || body !== (block.body ?? "");

  return (
    <div
      className={
        "flex gap-3 border border-line p-3 " +
        (block.active ? "bg-surface" : "bg-surface/40 opacity-70")
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.imageUrl}
        alt={block.title}
        className="h-28 w-20 shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tittel"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Kort tekst"
          rows={2}
          className={inputCls}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            disabled={pending || !dirty}
            onClick={() => run(() => saveCraftText(block.id, title, body))}
            className="px-3 py-1.5 text-xs"
          >
            Lagre tekst
          </Button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Flytt opp"
              disabled={isTop || pending}
              onClick={() => run(() => moveCraft(block.id, "up"))}
              className="border border-line-2 px-2 py-1 text-xs text-muted hover:text-fg disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Flytt ned"
              disabled={isBottom || pending}
              onClick={() => run(() => moveCraft(block.id, "down"))}
              className="border border-line-2 px-2 py-1 text-xs text-muted hover:text-fg disabled:opacity-30"
            >
              ↓
            </button>
          </div>
          <Button
            type="button"
            variant="link"
            disabled={pending}
            onClick={() => run(() => toggleCraft(block.id, !block.active))}
            className="text-xs font-semibold"
          >
            {block.active ? "Skjul" : "Vis"}
          </Button>
          <ConfirmButton
            label="Slett"
            question={`Slette blokken «${block.title}»?`}
            confirmLabel="Ja, slett"
            pendingLabel="Sletter …"
            onConfirm={() => deleteCraft(block.id)}
          />
          {msg && err && <span className="text-xs text-danger">{msg}</span>}
          {!block.active && (
            <Badge tone="neutral">Skjult (kun forhåndsvisning)</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function AddBlock() {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border border-dashed border-line-2 px-4 py-2 text-sm font-semibold text-accent-soft transition-colors hover:border-accent-soft"
      >
        + Ny blokk
      </button>
    );
  }
  return (
    <Card>
      <form
        action={(fd) =>
          start(async () => {
            setErr(null);
            const r = await createCraft(fd);
            if (r.error) setErr(r.error);
            else setOpen(false);
          })
        }
        className="space-y-3"
      >
        <p className="text-sm font-semibold text-fg">Ny håndverk-blokk</p>
      <label className="block text-xs text-muted">
        Bilde
        <input
          name="file"
          type="file"
          accept="image/*"
          required
          className="mt-1 block text-xs text-fg file:mr-2 file:border file:border-line-2 file:bg-canvas file:px-2 file:py-1 file:text-xs"
        />
      </label>
      <Input name="title" placeholder="Tittel" required />
      <textarea name="body" placeholder="Kort tekst" rows={2} className={inputCls} />
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={pending}
          className="px-3 py-1.5 text-sm"
        >
          {pending ? "Legger til …" : "Legg til blokk"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          className="text-xs"
        >
          Avbryt
        </Button>
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
      </form>
    </Card>
  );
}

export function SiteCraftManager({ blocks }: { blocks: CraftBlock[] }) {
  return (
    <div className="space-y-3">
      {blocks.length === 0 ? (
        <EmptyState description="Ingen egne blokker – forsiden viser standard-håndverket til du legger til noen." />
      ) : (
        blocks.map((b, i) => (
          <BlockRow
            key={b.id}
            block={b}
            isTop={i === 0}
            isBottom={i === blocks.length - 1}
          />
        ))
      )}
      <AddBlock />
    </div>
  );
}
