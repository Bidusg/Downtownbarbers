-- =====================================================================
-- KJØR-I-SUPABASE-NAVN-REPARASJON.sql  (idempotent)
--   Retter kundenavn som ble lagret med feil store bokstaver rundt æ/ø/å
--   (f.eks. «Martin BØHm», «Brynjar WØLstad-Knudsen»). Feilen lå i
--   navneformateringen ved booking og er rettet i koden.
--   Berører KUN navn med mønsteret (Æ/Ø/Å fulgt av stor bokstav, eller liten
--   bokstav fulgt av stor Æ/Ø/Å) – andre navn røres ikke.
-- =====================================================================

create or replace function fix_name_case(p text) returns text
language plpgsql immutable as $$
declare
  res text := '';
  ch text;
  prev text := ' ';
  i int;
begin
  if p is null then return null; end if;
  for i in 1..char_length(p) loop
    ch := substr(p, i, 1);
    if prev ~ '[[:space:]''’-]' then
      res := res || upper(ch);
    else
      res := res || lower(ch);
    end if;
    prev := ch;
  end loop;
  return res;
end $$;

-- Forhåndsvisning (kjør gjerne denne først):
-- select full_name, fix_name_case(full_name) from customers
--  where full_name ~ '[ÆØÅ][A-ZÆØÅ]|[a-zæøå][ÆØÅ]';

update customers
   set full_name = fix_name_case(full_name)
 where full_name ~ '[ÆØÅ][A-ZÆØÅ]|[a-zæøå][ÆØÅ]';

drop function fix_name_case(text);
