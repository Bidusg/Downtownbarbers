"use client";

import { Fragment, useState, useTransition } from "react";
import type { AdminService, Category } from "@/lib/admin-queries";
import {
  createService,
  updateService,
  toggleService,
  toggleOnlineBookable,
  deleteService,
} from "@/app/admin/tjenester/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import {
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmpty,
} from "@/components/ui/Table";
import { formatKr } from "@/lib/format";

function ServiceForm({
  categories,
  service,
  onDone,
}: {
  categories: Category[];
  service?: AdminService;
  onDone: () => void;
}) {
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card>
      <form
        action={(fd) =>
          start(async () => {
            setErr(null);
            const res = service
              ? await updateService(service.id, fd)
              : await createService(fd);
            if (res.error) setErr(res.error);
            else onDone();
          })
        }
        className="grid gap-3 sm:grid-cols-2"
      >
        <Input
          name="name"
          placeholder="Navn"
          required
          defaultValue={service?.name ?? ""}
        />
        <Select name="category_id" defaultValue={service?.category_id ?? ""}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input
          name="price_nok"
          type="number"
          placeholder="Pris (kr)"
          required
          defaultValue={service?.price_nok ?? ""}
        />
        <Input
          name="duration_min"
          type="number"
          placeholder="Varighet (min)"
          defaultValue={service?.duration_min ?? 30}
        />
        <Input
          name="description"
          placeholder="Beskrivelse"
          defaultValue={service?.description ?? ""}
          className="sm:col-span-2"
        />
        {err && <p className="text-sm text-danger sm:col-span-2">{err}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" disabled={saving} className="px-4 py-2 text-sm">
            {saving ? "Lagrer …" : service ? "Lagre endringer" : "Lagre tjeneste"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onDone}
            className="px-4 py-2 text-sm"
          >
            Avbryt
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ServiceManager({
  services,
  categories,
  popularity = {},
}: {
  services: AdminService[];
  categories: Category[];
  /** service_id → antall fullførte bookinger siste 90 dager */
  popularity?: Record<string, number>;
}) {
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {services.length} tjenester
          <span className="ml-2 text-xs">
            · Hvem som leverer hva settes nå per ansatt under{" "}
            <a href="/admin/ansatte" className="text-accent-soft hover:underline">
              Ansatte → Rediger
            </a>
          </span>
        </p>
        <Button
          variant="primary"
          onClick={() => {
            setCreating((o) => !o);
            setEditId(null);
          }}
          className="px-4 py-2 text-sm"
        >
          {creating ? "Lukk" : "+ Ny tjeneste"}
        </Button>
      </div>

      {creating && (
        <ServiceForm
          categories={categories}
          onDone={() => setCreating(false)}
        />
      )}

      <Card padded={false}>
        <Table>
          <THead>
            <Tr head className="bg-surface-2 uppercase tracking-wide">
              <Th>Tjeneste</Th>
              <Th>Kategori</Th>
              <Th>Pris</Th>
              <Th>Varighet</Th>
              <Th>Populær (90d)</Th>
              <Th>Status</Th>
              <Th>Bookbar på nett</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {services.length === 0 && (
              <TableEmpty colSpan={8}>
                Ingen tjenester enda – legg til den første, eller koble til Supabase.
              </TableEmpty>
            )}
            {services.map((s) =>
              editId === s.id ? (
                <Tr key={s.id}>
                  <Td colSpan={8} className="p-4">
                    <ServiceForm
                      categories={categories}
                      service={s}
                      onDone={() => setEditId(null)}
                    />
                  </Td>
                </Tr>
              ) : (
                <Fragment key={s.id}>
                <Tr className="align-top">
                  <Td>
                    <span className="font-medium text-fg">{s.name}</span>
                    {s.description && (
                      <span className="block text-xs text-muted">
                        {s.description}
                      </span>
                    )}
                  </Td>
                  <Td muted>{s.categoryName}</Td>
                  <Td className="font-display">{formatKr(s.price_nok)}</Td>
                  <Td muted>{s.duration_min} min</Td>
                  <Td muted>{popularity[s.id] ?? 0}</Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={"text-xs " + (s.active ? "text-accent-soft" : "text-muted")}>
                        {s.active ? "Aktiv" : "Skjult"}
                      </span>
                      <button
                        onClick={() => start(() => toggleService(s.id, !s.active))}
                        disabled={pending}
                        className={s.active ? "act" : "act act-accent"}
                      >
                        {s.active ? "Deaktiver" : "Aktiver"}
                      </button>
                    </span>
                  </Td>
                  <Td>
                    <button
                      onClick={() =>
                        start(() =>
                          toggleOnlineBookable(s.id, !s.online_bookable),
                        )
                      }
                      disabled={pending}
                      className={
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                        (s.online_bookable
                          ? "bg-accent-soft/15 text-accent-soft"
                          : "bg-surface-2 text-muted")
                      }
                    >
                      {s.online_bookable ? "På nett" : "Av"}
                    </button>
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    <Button
                      variant="link"
                      onClick={() => {
                        setEditId(s.id);
                        setCreating(false);
                      }}
                      className="text-xs"
                    >
                      Rediger
                    </Button>
                    <span className="mx-2 text-line-2">·</span>
                    <ConfirmButton
                      label="Slett"
                      confirmLabel="Ja, slett"
                      pendingLabel="Sletter …"
                      disabled={pending}
                      onConfirm={() => deleteService(s.id)}
                    />
                  </Td>
                </Tr>
                </Fragment>
              ),
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
