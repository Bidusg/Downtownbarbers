-- =====================================================================
-- NETTORDRER – REFUSJON SOM GAVEKORT (TILGODELAPP), VIPPS FJERNET
--
--   Vipps-refusjon er ikke en mulighet for oss, så «Vipps» er tatt ut som
--   refusjonsmåte. I stedet kan refusjonen gis som GAVEKORT:
--
--     • det utstedes et gavekort på refusjonsbeløpet (kode DB-XXXXXX),
--     • koden returneres, slik at kassa kan vise den og kunden får den
--       på e-post,
--     • refusjonen føres som et negativt «Gavekort»-oppgjør på salget –
--       samme logikk som når et gavekort brukes som betaling, bare med
--       motsatt fortegn. Pengene går altså ikke ut av kassa; forpliktelsen
--       flyttes til gavekortgjelden.
--
--   Gavekortet får INGEN utløpsdato. En tilgodelapp er kundens egne penger,
--   og et krav foreldes først etter tre år (foreldelsesloven § 2). En kort
--   utløpsdato ville vi ikke stått støtt på.
--
--   Mellomlegg kunden BETALER ved bytte kan fortsatt tas i Vipps – det er en
--   vanlig innbetaling i kassa, ikke en Vipps-refusjon.
--
--   Endrer bare online_order_return. Krever KJØR-I-SUPABASE-NETTORDRE-RETUR.sql.
--   Trygt å kjøre flere ganger.
-- =====================================================================
begin;

-- p_kind:         retur | reklamasjon | bytte
-- p_lines:        [{"item": "<uuid>", "qty": 1}]      varer kunden leverer tilbake
-- p_restock:      legg de returnerte varene tilbake på lager
-- p_refund:       beløp kunden får tilbake (0 ved rent bytte)
-- p_refund_method Gavekort | Kort | Kontant
-- p_replacements: [{"product": "<uuid>", "qty": 1}]  varer kunden får i bytte
-- p_extra:        mellomlegg kunden betaler (bytte til dyrere vare)
create or replace function online_order_return(
  p_order uuid, p_kind text, p_lines jsonb, p_restock boolean,
  p_refund numeric, p_refund_method text,
  p_replacements jsonb default '[]'::jsonb, p_extra numeric default 0, p_extra_method text default null,
  p_note text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_o online_orders; v_l jsonb; v_it online_order_items; v_q int; v_stock int; v_prod record;
  v_sale uuid; v_items_sum numeric := 0; v_total numeric; v_log text[] := '{}'; v_repl text[] := '{}';
  v_refund numeric := round(coalesce(p_refund, 0), 2); v_extra numeric := round(coalesce(p_extra, 0), 2);
  v_gift text := null; v_try int;
begin
  if not is_shop_or_admin() then raise exception 'Ikke tilgang'; end if;
  if p_kind not in ('retur', 'reklamasjon', 'bytte') then raise exception 'BAD_KIND'; end if;
  select * into v_o from online_orders where id = p_order for update;
  if v_o.id is null then raise exception 'NOT_FOUND'; end if;
  if v_o.status not in ('picked_up', 'shipped') then raise exception 'NOT_COMPLETED'; end if;
  if v_refund < 0 or v_extra < 0 then raise exception 'BAD_AMOUNT'; end if;
  if v_refund > v_o.total_nok - v_o.refunded_nok then raise exception 'REFUND_TOO_HIGH:%', v_o.total_nok - v_o.refunded_nok; end if;
  -- Vipps er IKKE lenger en refusjonsmåte.
  if v_refund > 0 and p_refund_method not in ('Gavekort', 'Kort', 'Kontant') then raise exception 'BAD_METHOD'; end if;
  if v_extra > 0 and coalesce(p_extra_method, '') not in ('Vipps', 'Kort', 'Kontant') then raise exception 'BAD_METHOD'; end if;

  insert into sales (booking_id, staff_id, customer_id, total_nok, payment_method)
  values (null, null, v_o.customer_id, 0,
          case when v_refund > 0 then p_refund_method when v_extra > 0 then p_extra_method else 'Bytte' end)
  returning id into v_sale;

  -- Varene som kommer tilbake.
  for v_l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_q := coalesce((v_l->>'qty')::int, 0);
    if v_q <= 0 then continue; end if;
    select * into v_it from online_order_items where id = (v_l->>'item')::uuid and order_id = p_order for update;
    if v_it.id is null then raise exception 'NOT_FOUND'; end if;
    if v_q > v_it.qty - v_it.missing_qty - v_it.returned_qty then raise exception 'TOO_MANY:%', v_it.name; end if;
    update online_order_items set returned_qty = returned_qty + v_q where id = v_it.id;
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
    values (v_sale, 'product', v_it.product_id,
            initcap(p_kind) || ': ' || v_it.name || ' (ordre #' || v_o.order_no || ')', -v_q, v_it.unit_price_nok);
    v_items_sum := v_items_sum - v_it.unit_price_nok * v_q;
    if v_it.product_id is not null then
      if p_restock then
        update products set stock = stock + v_q where id = v_it.product_id and not is_gift_card returning stock into v_stock;
        if found then
          insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
          values (v_it.product_id, v_q, p_kind, 'Ordre #' || v_o.order_no, v_stock, auth.uid());
        end if;
      else
        insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
        select v_it.product_id, 0, p_kind || ' – ikke på lager igjen', 'Ordre #' || v_o.order_no || ': ' || v_q || ' stk', stock, auth.uid()
          from products where id = v_it.product_id;
      end if;
    end if;
    v_log := v_log || (v_q || ' × ' || v_it.name);
  end loop;

  -- Varene kunden får i bytte.
  for v_l in select * from jsonb_array_elements(coalesce(p_replacements, '[]'::jsonb)) loop
    v_q := coalesce((v_l->>'qty')::int, 0);
    if v_q <= 0 then continue; end if;
    select id, coalesce(web_name, name) as name, price_nok, stock into v_prod
      from products where id = (v_l->>'product')::uuid and active and not is_gift_card for update;
    if v_prod.id is null then raise exception 'NOT_FOUND'; end if;
    if v_prod.stock < v_q then raise exception 'OUT_OF_STOCK:%', v_prod.name; end if;
    update products set stock = stock - v_q where id = v_prod.id returning stock into v_stock;
    insert into stock_movements (product_id, delta, reason, note, new_stock, created_by)
    values (v_prod.id, -v_q, 'bytte', 'Ordre #' || v_o.order_no, v_stock, auth.uid());
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
    values (v_sale, 'product', v_prod.id, 'Bytte: ' || v_prod.name || ' (ordre #' || v_o.order_no || ')', v_q, v_prod.price_nok);
    v_items_sum := v_items_sum + v_prod.price_nok * v_q;
    v_repl := v_repl || (v_q || ' × ' || v_prod.name);
  end loop;

  if array_length(v_log, 1) is null and array_length(v_repl, 1) is null then raise exception 'NOTHING'; end if;

  -- Refusjon som gavekort: utsted kortet før noe føres, så beløpet aldri
  -- registreres som tilbakebetalt uten at kunden faktisk har fått en kode.
  if v_refund > 0 and p_refund_method = 'Gavekort' then
    for v_try in 1..10 loop
      begin
        insert into gift_cards (code, initial_nok, balance_nok)
        values ('DB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)), v_refund, v_refund)
        returning code into v_gift;
        exit;
      exception when unique_violation then v_gift := null;  -- koden var tatt, prøv igjen
      end;
    end loop;
    if v_gift is null then raise exception 'GIFT_FAILED'; end if;
  end if;

  -- Pengene som faktisk går inn/ut. Avvik mot varelinjene (kundeklubb-
  -- rabatt, kulanse) føres som egen justeringslinje, så salget stemmer.
  v_total := v_extra - v_refund;
  if v_total <> v_items_sum then
    insert into sale_items (sale_id, kind, ref_id, description, quantity, price_nok)
    values (v_sale, 'adjustment', null, 'Rabatt / justering (ordre #' || v_o.order_no || ')', 1, v_total - v_items_sum);
  end if;
  update sales set total_nok = v_total where id = v_sale;
  if v_refund > 0 then
    insert into sale_payments (sale_id, method, amount) values (v_sale, p_refund_method, -v_refund);
  end if;
  if v_extra > 0 then
    insert into sale_payments (sale_id, method, amount) values (v_sale, p_extra_method, v_extra);
  end if;

  update online_orders
     set refunded_nok = refunded_nok + v_refund,
         payment_status = case when v_refund > 0 and refunded_nok + v_refund >= total_nok then 'refunded' else payment_status end
   where id = p_order;

  insert into online_order_events (order_id, created_by, kind, text, amount_nok, sale_id)
  values (p_order, auth.uid(),
          case p_kind when 'retur' then 'return' when 'reklamasjon' then 'complaint' else 'exchange' end,
          initcap(p_kind) || ': ' || coalesce(array_to_string(v_log, ', '), '–')
            || case when array_length(v_repl, 1) > 0 then ' → byttet til ' || array_to_string(v_repl, ', ') else '' end
            || case when v_refund > 0 then '. Refundert ' || v_refund || ' kr (' || p_refund_method || ')' else '' end
            || coalesce(' – gavekort ' || v_gift, '')
            || case when v_extra > 0 then '. Mellomlegg ' || v_extra || ' kr (' || p_extra_method || ')' else '' end
            || case when array_length(v_log, 1) > 0 then case when p_restock then '. Lagt tilbake på lager' else '. Ikke lagt på lager' end else '' end
            || coalesce('. ' || nullif(trim(coalesce(p_note, '')), ''), ''),
          v_total, v_sale);

  return json_build_object(
    'sale_id', v_sale, 'refund', v_refund, 'extra', v_extra,
    'gift_code', v_gift,
    'replaced_with', coalesce(array_to_string(v_repl, ', '), ''));
end $$;
revoke execute on function online_order_return(uuid, text, jsonb, boolean, numeric, text, jsonb, numeric, text, text) from public, anon;
grant  execute on function online_order_return(uuid, text, jsonb, boolean, numeric, text, jsonb, numeric, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
