-- =====================================================================
-- Flytt etterregistrerte salg til riktig dag (engangsretting)
--
-- Salg for timer fra en TIDLIGERE dag som ble registrert senere (f.eks.
-- lørdagens timer betalt inn på mandag) står i dag på registreringsdagen.
-- Dette flytter dem til timens dag, så de havner i riktig dags oppgjør og
-- rapporter. Ny kode gjør dette automatisk fremover.
--
-- Gjelder kun salg knyttet til en time, registrert de siste 30 dagene.
-- Hurtigsalg uten time røres ikke.
--
-- Kjør STEG 1 først og se over listen. Kjør så STEG 2.
-- =====================================================================

-- STEG 1 – forhåndsvisning (endrer ingenting)
select s.id,
       (s.sold_at  at time zone 'Europe/Oslo')::date as registrert_dag,
       (b.start_at at time zone 'Europe/Oslo')::date as timens_dag,
       s.total_nok
  from sales s
  join bookings b on b.id = s.booking_id
 where s.sold_at >= now() - interval '30 days'
   and (b.start_at at time zone 'Europe/Oslo')::date
     < (s.sold_at  at time zone 'Europe/Oslo')::date
 order by registrert_dag desc, timens_dag;

-- STEG 2 – flytt salgene til timens dag
update sales s
   set sold_at = b.start_at
  from bookings b
 where b.id = s.booking_id
   and s.sold_at >= now() - interval '30 days'
   and (b.start_at at time zone 'Europe/Oslo')::date
     < (s.sold_at  at time zone 'Europe/Oslo')::date;
