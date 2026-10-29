-- =====================================================================
-- TILGIVENDE KUNDESØK (søk mens du skriver)
--   • Store/små bokstaver, aksenter og æ/ø/å spiller ingen rolle.
--   • Hvert ord i søket må treffe (rekkefølgen er likegyldig):
--     starten av et ord, en del av et ord, eller nesten likt (skrivefeil).
--   • Telefon: sifrene holder, med eller uten mellomrom/+47.
--   Brukes av Admin → Kunder, Kasse → Kunder og kundesøket i kassa.
--   Kan kjøres flere ganger.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- «Bjørn Ærø-Åsen» → «bjorn aero asen»
create or replace function dtb_norm(p text) returns text
language sql immutable set search_path = public as $$
  select trim(regexp_replace(
           translate(
             replace(replace(replace(lower(coalesce(p, '')), 'æ', 'ae'), 'ø', 'o'), 'å', 'a'),
             'áàâäãéèêëíìîïóòôöõúùûüýÿñçšžčćđ',
             'aaaaaeeeeiiiiooooouuuuyyncszccd'),
           '[^a-z0-9@.]+', ' ', 'g'));
$$;

-- Rangerte treff: id + poeng (høyest først). Tom liste ved tomt søk.
create or replace function customer_search_rank(p_q text, p_limit int default 200)
returns table (id uuid, score real)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_nq    text := dtb_norm(p_q);
  v_dq    text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_terms text[];
begin
  if not is_shop_or_admin() then raise exception 'Ikke tilgang'; end if;
  if length(v_dq) = 10 and v_dq like '47%' then v_dq := substr(v_dq, 3); end if;
  if length(v_dq) = 12 and v_dq like '0047%' then v_dq := substr(v_dq, 5); end if;
  v_terms := array(select t from unnest(string_to_array(v_nq, ' ')) t where t <> '');
  if coalesce(array_length(v_terms, 1), 0) = 0 and length(v_dq) < 3 then return; end if;

  return query
  with c as (
    select cu.id,
           ' ' || dtb_norm(coalesce(cu.full_name, '') || ' ' || coalesce(cu.email, '')) as hay,
           regexp_replace(coalesce(cu.phone, ''), '\D', '', 'g') as ph
      from customers cu
  ),
  s as (
    select c.id,
           case
             when length(v_dq) >= 3 and c.ph like '%' || v_dq || '%' then 100::real
             else (
               select sum(
                        case
                          when c.hay like '% ' || t || ' %' or c.hay like '% ' || t then 4
                          when c.hay like '% ' || t || '%' then 3
                          when length(t) >= 2 and strpos(c.hay, t) > 0 then 2
                          when length(t) >= 4 and word_similarity(t, c.hay) >= 0.45
                            then word_similarity(t, c.hay)
                          else -1000
                        end)::real
                 from unnest(v_terms) t)
           end as score
      from c
  )
  select s.id, s.score from s
   where s.score > 0
   order by s.score desc
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
end $$;

revoke execute on function customer_search_rank(text, int) from public, anon;
grant  execute on function customer_search_rank(text, int) to authenticated;

-- Kundesøket i kassa (samme kolonner som før – nå med tilgivende søk).
create or replace function shop_customer_search(p_q text)
returns table (
  id         uuid,
  full_name  text,
  phone      text,
  email      text,
  visits     int,
  last_visit timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_shop_or_admin() then
    raise exception 'Ikke tilgang';
  end if;
  return query
  select
    c.id, c.full_name, c.phone, c.email,
    (select count(*)::int from bookings b
       where b.customer_id = c.id and b.status <> 'cancelled') as visits,
    (select max(b.start_at) from bookings b
       where b.customer_id = c.id and b.status <> 'cancelled') as last_visit
  from customer_search_rank(p_q, 20) r
  join customers c on c.id = r.id
  order by r.score desc, c.full_name;
end $$;

revoke execute on function shop_customer_search(text) from anon, public;
grant  execute on function shop_customer_search(text) to authenticated;

notify pgrst, 'reload schema';
