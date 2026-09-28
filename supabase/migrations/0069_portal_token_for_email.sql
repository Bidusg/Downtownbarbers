-- =====================================================================
-- 0069 – KUNDE-INNLOGGING (passordløs magisk lenke)
--
--   Kunder logger inn ved å skrive e-posten sin og få tilsendt en lenke
--   til «Min side». Hver kunde har allerede en portal_token (0022). Denne
--   funksjonen slår opp token ut fra e-post, slik at server-koden kan sende
--   lenken. SECURITY DEFINER + kun kalt server-side; svaret vises aldri til
--   klienten (server svarer alltid nøytralt), så vi lekker ikke om en
--   e-post finnes.
--
--   Idempotent.
-- =====================================================================

create or replace function portal_token_for_email(p_email text)
returns uuid
language sql security definer set search_path = public as $$
  select c.portal_token
  from customers c
  where p_email is not null
    and trim(p_email) <> ''
    and lower(trim(c.email)) = lower(trim(p_email))
  order by c.created_at asc
  limit 1;
$$;

grant execute on function portal_token_for_email(text) to anon, authenticated;
