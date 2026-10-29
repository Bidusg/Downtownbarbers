-- =====================================================================
-- ENDRE KASSEOPPGJØR
--   Et levert oppgjør kan rettes fra kassa (siste 7 dager) og fra admin
--   (alle datoer). Hver endring krever en begrunnelse, og de gamle tallene
--   tas vare på i «history» – revisor ser hva som ble endret, av hvem og når.
--   Bokføringen i Tripletex bygger på salgene, ikke de talte beløpene, så
--   en retting her endrer ikke bilaget.
--   Kan kjøres flere ganger.
-- =====================================================================

alter table cash_settlements add column if not exists edited_at  timestamptz;
alter table cash_settlements add column if not exists edited_by  uuid;
alter table cash_settlements add column if not exists edit_count int not null default 0;
alter table cash_settlements add column if not exists history    jsonb not null default '[]'::jsonb;

create or replace function edit_cash_settlement(
  p_id uuid,
  p_cash numeric, p_card numeric, p_vipps numeric,
  p_expected_cash numeric, p_expected_card numeric, p_expected_vipps numeric,
  p_note text, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v cash_settlements;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not is_shop_or_admin() then raise exception 'Ingen tilgang'; end if;
  if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
  select * into v from cash_settlements where id = p_id for update;
  if v.id is null then raise exception 'NOT_FOUND'; end if;
  if not is_admin()
     and v.settle_date < (now() at time zone 'Europe/Oslo')::date - 7 then
    raise exception 'TOO_OLD';
  end if;

  update cash_settlements
     set history = coalesce(history, '[]'::jsonb) || jsonb_build_object(
           'at', now(), 'by', auth.uid(), 'reason', left(v_reason, 500),
           'counted_cash', v.counted_cash, 'counted_card', v.counted_card,
           'counted_vipps', v.counted_vipps, 'total_nok', v.total_nok, 'note', v.note),
         counted_cash   = greatest(0, round(coalesce(p_cash, 0))),
         counted_card   = greatest(0, round(coalesce(p_card, 0))),
         counted_vipps  = greatest(0, round(coalesce(p_vipps, 0))),
         total_nok      = greatest(0, round(coalesce(p_cash, 0))) + greatest(0, round(coalesce(p_card, 0)))
                          + greatest(0, round(coalesce(p_vipps, 0))),
         expected_cash  = coalesce(p_expected_cash, expected_cash),
         expected_card  = coalesce(p_expected_card, expected_card),
         expected_vipps = coalesce(p_expected_vipps, expected_vipps),
         note           = nullif(left(coalesce(p_note, ''), 1000), ''),
         confirmed      = true,
         edited_at      = now(),
         edited_by      = auth.uid(),
         edit_count     = coalesce(edit_count, 0) + 1
   where id = p_id;
end $$;

revoke execute on function edit_cash_settlement(uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text) from public, anon;
grant  execute on function edit_cash_settlement(uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, text) to authenticated;

notify pgrst, 'reload schema';
