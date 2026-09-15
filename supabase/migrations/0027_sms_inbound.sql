-- =====================================================================
-- 0027 — Innkommende SMS: STOPP/START (A2P-samtykke)
--   A2P-leverandører krever at kunder kan reservere seg ved å svare STOPP,
--   og melde seg på igjen med START/JA. Vi gjenbruker samtykke-flagget fra
--   0023 (customers.marketing_consent) som ÉN kilde: markedsførings-utsending
--   filtrerer allerede på det, så en STOPP fjerner kunden fra alle framtidige
--   markedsførings-SMS automatisk. Booking-påminnelser (transaksjonelle) er
--   ikke markedsføring og påvirkes ikke.
--
--   Innhold:
--     1) sms_inbound — logg over innkommende meldinger (revisjon/dokumentasjon)
--     2) sms_set_consent_by_phone(telefon, samtykke) — normaliserer norsk
--        nummer og slår samtykke av/på for alle kunder med det nummeret
--     3) sms_inbound_handle(fra, tekst, handling) — logger + setter samtykke,
--        kalles av webhooken. Returnerer {action, matched}.
--     4) sms_inbound_recent(limit) — admin leser siste innkommende (for UI)
-- Idempotent.
-- =====================================================================

-- 1) Logg over innkommende meldinger.
create table if not exists sms_inbound (
  id          uuid primary key default gen_random_uuid(),
  from_phone  text not null,
  body        text,
  action      text not null default 'other',   -- 'stop' | 'start' | 'other'
  matched     int  not null default 0,          -- antall kunder oppdatert
  created_at  timestamptz not null default now()
);
create index if not exists sms_inbound_created_idx on sms_inbound (created_at desc);

alter table sms_inbound enable row level security;
drop policy if exists sms_inbound_admin_all on sms_inbound;
create policy sms_inbound_admin_all on sms_inbound
  for all using (is_admin()) with check (is_admin());

-- 2) Sett samtykke via telefonnummer (normalisert). Returnerer antall treff.
--    Normalisering: behold kun sifre, sammenlign på de siste 8 (norske
--    mobilnummer er 8 sifre), så +47/0047/47/mellomrom spiller ingen rolle.
create or replace function sms_set_consent_by_phone(
  p_phone text, p_consent boolean
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_count int;
begin
  v_key := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 8);
  if length(v_key) < 8 then
    return 0;
  end if;

  update customers
     set marketing_consent = p_consent,
         marketing_consent_at = now()
   where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 8) = v_key;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function sms_set_consent_by_phone(text, boolean) to anon, authenticated;

-- 3) Håndter en innkommende melding: logg + evt. samtykkeendring.
--    p_action: 'stop' -> samtykke av, 'start' -> samtykke på, ellers bare logg.
create or replace function sms_inbound_handle(
  p_from text, p_body text, p_action text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(coalesce(p_action, 'other'));
  v_matched int := 0;
begin
  if v_action = 'stop' then
    v_matched := sms_set_consent_by_phone(p_from, false);
  elsif v_action = 'start' then
    v_matched := sms_set_consent_by_phone(p_from, true);
  else
    v_action := 'other';
  end if;

  insert into sms_inbound (from_phone, body, action, matched)
  values (coalesce(p_from, ''), p_body, v_action, v_matched);

  return jsonb_build_object('action', v_action, 'matched', v_matched);
end $$;
grant execute on function sms_inbound_handle(text, text, text) to anon, authenticated;

-- 4) Admin: siste innkommende meldinger (for markedsføringssiden).
create or replace function sms_inbound_recent(p_limit int default 20)
returns setof sms_inbound
language sql
stable
security definer
set search_path = public
as $$
  select * from sms_inbound
  where is_admin()
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 200));
$$;
grant execute on function sms_inbound_recent(int) to authenticated;
