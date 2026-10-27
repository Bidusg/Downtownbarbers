-- =====================================================================
-- TILBAKESTILL LAGER ETTER TESTBESTILLINGER
--
--   Testordrer har tatt varer ut av lageret. Dette skriptet legger dem
--   tilbake – nøyaktig like mange som ordren faktisk tok, regnet ut fra
--   lagerbevegelsene ordren selv laget.
--
--   Derfor er det trygt å kjøre på alle tre testordrene samtidig:
--   ordren som ble kansellert fikk varene tilbake automatisk, så
--   nettosummen for den er 0, og da skjer det ingenting med den.
--
--   KJØR DEL 1 FØRST. Den endrer ingenting – den viser bare hva som
--   skjedde, så du ser at du har de riktige ordrenumrene før du retter.
-- =====================================================================


-- ---------------------------------------------------------------------
-- DEL 1 – SE PÅ DET (endrer ingenting)
-- ---------------------------------------------------------------------

-- 1a) De siste 10 nettordrene. Finn testordrene dine her.
select o.order_no,
       to_char(o.created_at at time zone 'Europe/Oslo', 'DD.MM HH24:MI') as bestilt,
       o.name, o.status, o.payment_status, o.total_nok,
       string_agg(i.qty || ' × ' || i.name, ', ' order by i.name) as varer
  from online_orders o
  left join online_order_items i on i.order_id = o.id
 group by o.id
 order by o.created_at desc
 limit 10;

-- 1b) Hva ordrene gjorde med lageret. «netto» er det som skal legges
--     tilbake: er den 0, har lageret alt kommet i balanse igjen.
--     >>> SETT INN DINE ORDRENUMRE I array[...] <<<
with valgte as (select unnest(array[1, 2, 3]) as nr)
select v.nr as ordre,
       p.name as vare,
       sum(m.delta) as netto,
       -sum(m.delta) as legges_tilbake,
       p.stock as lager_na,
       p.stock - sum(m.delta) as lager_etter
  from valgte v
  join stock_movements m
    on m.note = 'Ordre #' || v.nr
    or m.note like 'Ordre #' || v.nr || ':%'
  join products p on p.id = m.product_id
 group by v.nr, p.id, p.name, p.stock
 having sum(m.delta) <> 0
 order by v.nr, p.name;


-- ---------------------------------------------------------------------
-- DEL 2 – RETT LAGERET
--   Stemmer «lager_etter» i 1b, kjør denne. Den er idempotent: kjører du
--   den to ganger, gjør den ingenting andre gangen, fordi den da ser at
--   nettosummen for ordren alt er 0.
--   >>> SAMME ORDRENUMRE HER <<<
-- ---------------------------------------------------------------------
do $$
declare
  v_ordrer int[] := array[1, 2, 3];   -- << ordrenumrene dine
  v_r record;
  v_ny int;
  v_antall int := 0;
begin
  for v_r in
    with valgte as (select unnest(v_ordrer) as nr)
    select v.nr, m.product_id, sum(m.delta) as netto
      from valgte v
      join stock_movements m
        on m.note = 'Ordre #' || v.nr
        or m.note like 'Ordre #' || v.nr || ':%'
     group by v.nr, m.product_id
     having sum(m.delta) <> 0
  loop
    update products
       set stock = stock - v_r.netto
     where id = v_r.product_id and not is_gift_card
     returning stock into v_ny;
    if found then
      insert into stock_movements (product_id, delta, reason, note, new_stock)
      values (v_r.product_id, -v_r.netto, 'testordre tilbakestilt',
              'Ordre #' || v_r.nr || ' – lager satt tilbake til før testen', v_ny);
      v_antall := v_antall + 1;
    end if;
  end loop;
  raise notice 'Lageret er rettet for % varelinjer.', v_antall;
end $$;

-- Kontroll: nå skal 1b ikke gi noen rader i det hele tatt.


-- ---------------------------------------------------------------------
-- DEL 3 – VALGFRITT: FJERN TESTSALGENE FRA REGNSKAPET
--
--   Testordrer som ble utlevert/sendt laget også et SALG. Det ligger nå i
--   omsetningen, kasseoppgjøret og regnskapet som ekte penger.
--
--   LES FØRST: er dagsoppgjøret for den dagen alt avstemt eller sendt til
--   regnskapsfører, IKKE slett – da skal det korrigeres hos Kumar i stedet,
--   så bilag og system fortsetter å stemme med hverandre. Er testene gjort
--   i dag og oppgjøret ikke er lukket, er sletting riktig.
--
--   Se hva som ville blitt slettet:
-- ---------------------------------------------------------------------
with valgte as (select unnest(array[1, 2, 3]) as nr)
select o.order_no, s.id as salg, s.total_nok, s.payment_method,
       to_char(s.created_at at time zone 'Europe/Oslo', 'DD.MM HH24:MI') as tid
  from valgte v
  join online_orders o on o.order_no = v.nr
  join sales s on s.id = o.sale_id
 order by o.order_no;

-- Fjern dem (ta bort kommentarene for å kjøre):
-- do $$
-- declare v_ordrer int[] := array[1, 2, 3]; v_s uuid;
-- begin
--   for v_s in select o.sale_id from online_orders o
--               where o.order_no = any(v_ordrer) and o.sale_id is not null loop
--     delete from sale_payments where sale_id = v_s;
--     delete from sale_items    where sale_id = v_s;
--     update online_orders set sale_id = null where sale_id = v_s;
--     delete from sales where id = v_s;
--   end loop;
--   raise notice 'Testsalgene er fjernet.';
-- end $$;
