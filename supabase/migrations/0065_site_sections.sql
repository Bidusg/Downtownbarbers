-- =====================================================================
-- 0065 — NETTSIDE-CMS (etappe 3): flere redigerbare seksjonsbilder
--   Utvider site_images (0063) med to nye seksjoner: 'about' («Om oss»-bildet)
--   og 'banner' (neon-banneret). Begge er enkeltbilder – forsiden bruker det
--   første aktive, med fallback til de innebygde bildene.
--
--   Gjenbruker samme offentlige 'site'-bøtte og RLS som 0063. Her utvides bare
--   seksjons-CHECK-en. Idempotent: dropper eksisterende seksjons-check og
--   legger på nytt.
-- =====================================================================

do $$
declare c text;
begin
  -- Dropp enhver eksisterende CHECK som nevner 'section' (auto-navngitt eller vår).
  for c in
    select conname from pg_constraint
     where conrelid = 'public.site_images'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%section%'
  loop
    execute format('alter table site_images drop constraint %I', c);
  end loop;

  alter table site_images
    add constraint site_images_section_check
    check (section in ('hero', 'gallery', 'about', 'banner'));
end $$;
