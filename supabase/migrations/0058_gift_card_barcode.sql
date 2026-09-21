-- =====================================================================
-- 0058 — DIGITALT GAVEKORT MED STREKKODE
--
--   Fysisk gavekort med strekkode kobles til digital saldo: skann strekkode
--   (eller skriv koden) → gavekortet kommer opp med saldo, og kan innløses i
--   kassa. gift_cards er admin-only via RLS, så oppslag/innløsning går gjennom
--   security-definer-RPC-er som også shop kan bruke.
--
--   Idempotent.
-- =====================================================================

alter table gift_cards add column if not exists barcode text;

create unique index if not exists gift_cards_barcode_uidx
  on gift_cards (barcode)
  where barcode is not null and barcode <> '';

-- Oppslag på kode ELLER strekkode. Returnerer saldo + om utløpt.
create or replace function find_gift_card(p_code text)
returns table (
  id uuid, code text, balance_nok numeric, expires_at date, expired boolean
)
language sql stable security definer set search_path = public as $$
  select g.id, g.code, g.balance_nok, g.expires_at,
         (g.expires_at is not null and g.expires_at < current_date) as expired
  from gift_cards g
  where g.code = trim(p_code)
     or (g.barcode is not null and g.barcode = trim(p_code))
  limit 1;
$$;
grant execute on function find_gift_card(text) to authenticated;

-- Atomisk innløsning: finn kort på kode/strekkode, sjekk ikke utløpt, trekk
-- inntil saldo. Returnerer hvor mye som ble trukket + ny saldo. Shop + admin.
create or replace function redeem_gift_card_by_code(p_code text, p_amount numeric)
returns table (redeemed numeric, new_balance numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_balance numeric(10,2);
  v_expired boolean;
  v_take numeric(10,2);
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Ugyldig beløp';
  end if;

  select g.id, g.balance_nok,
         (g.expires_at is not null and g.expires_at < current_date)
    into v_id, v_balance, v_expired
  from gift_cards g
  where g.code = trim(p_code)
     or (g.barcode is not null and g.barcode = trim(p_code))
  for update
  limit 1;

  if v_id is null then
    raise exception 'Fant ikke gavekortet';
  end if;
  if v_expired then
    raise exception 'Gavekortet er utløpt';
  end if;
  if v_balance <= 0 then
    raise exception 'Gavekortet er tomt';
  end if;

  v_take := least(round(p_amount, 2), v_balance);
  update gift_cards set balance_nok = balance_nok - v_take where id = v_id;

  redeemed := v_take;
  new_balance := v_balance - v_take;
  return next;
end $$;
grant execute on function redeem_gift_card_by_code(text, numeric) to authenticated;
