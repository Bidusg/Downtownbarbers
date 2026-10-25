-- =====================================================================
-- NETTBUTIKK – KATEGORIER (kjør ETTER KJØR-I-SUPABASE-NETTBUTIKK.sql)
--   Ny struktur som i de store nettbutikkene: avdeling → produkttype,
--   pluss «behov» (tags) som Matt look, Mer volum, Grått hår, Sensitiv hud.
--     Hår       : Pomade & voks · Leire, pasta & fiber · Pudder, spray & tonic
--                 · Krem & gel · Sjampo · Balsam & kur · Hårfiber & dekking
--     Skjegg    : Skjeggolje · Balm & softener · Skjeggvask · Bartevoks · Skjeggkam
--     Barbering : Barberkrem & såpe · Før barbering · Etter barbering
--                 · Høvler, blader & kost · Barbermaskiner
--     Ansikt    : Ansiktspleie
--     Utstyr    : Kammer · Børster · Klippetilbehør · Durag
--   Kategori og produkttype lagres som nøkler (har, pomade …); navnene
--   ligger i koden. Trygt å kjøre flere ganger.
-- =====================================================================
begin;

alter table products add column if not exists subcategory text;
alter table products add column if not exists tags text[] not null default '{}';
create index if not exists products_category_idx on products (category, subcategory);

-- Gamle kategorinavn → ny avdeling (for produkter som ikke står i lista under).
update products set category = case category
    when 'Styling' then 'har' when 'Hårpleie' then 'har' when 'Hårfiber og dekking' then 'har'
    when 'Skjegg' then 'skjegg' when 'Barbering' then 'barbering'
    when 'Verktøy og tilbehør' then 'utstyr' else category end
 where category in ('Styling', 'Hårpleie', 'Hårfiber og dekking', 'Skjegg', 'Barbering', 'Verktøy og tilbehør');

update products set category = 'ansikt', subcategory = 'ansiktspleie', tags = '{}' where slug = 'depot-no-802-exfoliating-skin-cleanser-100-ml';
update products set category = 'ansikt', subcategory = 'ansiktspleie', tags = '{}' where slug = 'depot-no-803-daily-face-moisturizer-65-ml';
update products set category = 'ansikt', subcategory = 'ansiktspleie', tags = '{}' where slug = 'depot-no-805-no-hangover-face-gel-50-ml';
update products set category = 'barbering', subcategory = 'barberkrem', tags = '{}' where slug = 'captain-fawcetts-shaving-soap';
update products set category = 'barbering', subcategory = 'barberkrem', tags = '{}' where slug = 'depot-no-405-moisturizing-shave-cream-125ml';
update products set category = 'barbering', subcategory = 'barberkrem', tags = '{}' where slug = 'proraso-shaving-cream-coarse-beards-150-ml';
update products set category = 'barbering', subcategory = 'barberkrem', tags = '{}' where slug = 'proraso-shaving-cream-protective-150-ml';
update products set category = 'barbering', subcategory = 'barberkrem', tags = '{}' where slug = 'proraso-shaving-cream-refreshing-150-ml';
update products set category = 'barbering', subcategory = 'barberkrem', tags = '{"sensitiv"}' where slug = 'proraso-shaving-cream-sensitive-skin-150-ml';
update products set category = 'barbering', subcategory = 'barberkrem', tags = '{}' where slug = 'reuzel-shave-cream';
update products set category = 'barbering', subcategory = 'barbermaskiner', tags = '{}' where slug = 'wahl-finale-gold-foil';
update products set category = 'barbering', subcategory = 'barbermaskiner', tags = '{}' where slug = 'wahl-mobile-shaver';
update products set category = 'barbering', subcategory = 'etterbarbering', tags = '{}' where slug = 'depot-no-407-restoring-aftershave-100-ml';
update products set category = 'barbering', subcategory = 'etterbarbering', tags = '{"sensitiv"}' where slug = 'depot-no-408-moisturizing-after-shave-balm-100-ml';
update products set category = 'barbering', subcategory = 'etterbarbering', tags = '{}' where slug = 'reuzel-aftershave-original';
update products set category = 'barbering', subcategory = 'etterbarbering', tags = '{}' where slug = 'uppercut-aftershave-cologne';
update products set category = 'barbering', subcategory = 'forbarbering', tags = '{}' where slug = 'depot-no-402-pre-post-shave-emollient-fluid-100ml';
update products set category = 'barbering', subcategory = 'forbarbering', tags = '{}' where slug = 'depot-no-403-pre-shave-softening-beard-oil-30-ml';
update products set category = 'barbering', subcategory = 'forbarbering', tags = '{}' where slug = 'depot-no-406-transparent-shaving-gel-100-ml';
update products set category = 'barbering', subcategory = 'forbarbering', tags = '{"sensitiv"}' where slug = 'proraso-pre-shave-cream-sensitive-white-line-100-ml';
update products set category = 'barbering', subcategory = 'hovler', tags = '{}' where slug = 'astra-razor-blades-5-stk';
update products set category = 'barbering', subcategory = 'hovler', tags = '{}' where slug = 'beard-monkey-twistrazor-silver';
update products set category = 'barbering', subcategory = 'hovler', tags = '{}' where slug = 'depot-no-733-vintage-black-silver-barberkost';
update products set category = 'barbering', subcategory = 'hovler', tags = '{}' where slug = 'derby-5-blades-double-edge';
update products set category = 'barbering', subcategory = 'hovler', tags = '{}' where slug = 'derby-half-blade-razor-blades';
update products set category = 'barbering', subcategory = 'hovler', tags = '{}' where slug = 'derby-premium-single-edge';
update products set category = 'barbering', subcategory = 'hovler', tags = '{}' where slug = 'razor-blade-5-stk';
update products set category = 'har', subcategory = 'balsam', tags = '{}' where slug = 'depot-no-201-refreshing-conditioner-50ml';
update products set category = 'har', subcategory = 'balsam', tags = '{}' where slug = 'depot-no-202-complete-leave-in-conditioner-100-ml';
update products set category = 'har', subcategory = 'balsam', tags = '{"tynt-har"}' where slug = 'depot-no-205-invigorating-hair-treatment';
update products set category = 'har', subcategory = 'balsam', tags = '{"fet-hodebunn"}' where slug = 'depot-no-207-white-clay-sebum-control-treatment-125-ml';
update products set category = 'har', subcategory = 'balsam', tags = '{"krøller"}' where slug = 'matrix-curl-can-dream-cream';
update products set category = 'har', subcategory = 'balsam', tags = '{"krøller"}' where slug = 'matrix-curl-can-dream-mask';
update products set category = 'har', subcategory = 'balsam', tags = '{}' where slug = 'matrix-tr-food-for-soft-oil-serum';
update products set category = 'har', subcategory = 'balsam', tags = '{}' where slug = 'o-way-frequent-use-conditioner-240ml';
update products set category = 'har', subcategory = 'balsam', tags = '{}' where slug = 'reuzel-daily-conditioner';
update products set category = 'har', subcategory = 'balsam', tags = '{}' where slug = 'solomons-nourishing-conditioner-scutcher';
update products set category = 'har', subcategory = 'harfiber', tags = '{"grått-hår"}' where slug = 'colorwow-root-cover-up';
update products set category = 'har', subcategory = 'harfiber', tags = '{"grått-hår"}' where slug = 'loreal-professionnel-hair-touch-up-black';
update products set category = 'har', subcategory = 'harfiber', tags = '{"grått-hår"}' where slug = 'loreal-professionnel-hair-touch-up-brown';
update products set category = 'har', subcategory = 'harfiber', tags = '{"grått-hår"}' where slug = 'loreal-professionnel-hair-touch-up-light-brown';
update products set category = 'har', subcategory = 'harfiber', tags = '{"tynt-har"}' where slug = 'toppik-fiberhold';
update products set category = 'har', subcategory = 'harfiber', tags = '{"tynt-har"}' where slug = 'toppik-hair-perfecting-duo';
update products set category = 'har', subcategory = 'harfiber', tags = '{"tynt-har"}' where slug = 'toppik-harfiber-black-noir-12-g';
update products set category = 'har', subcategory = 'harfiber', tags = '{"tynt-har"}' where slug = 'toppik-harfiber-light-brown-12g';
update products set category = 'har', subcategory = 'harfiber', tags = '{"tynt-har"}' where slug = 'toppik-spray-applicator';
update products set category = 'har', subcategory = 'krem', tags = '{"grått-hår"}' where slug = 'depot-no-307-black-gel-125-ml';
update products set category = 'har', subcategory = 'krem', tags = '{"volum"}' where slug = 'depot-no-308-volume-creator-100-ml';
update products set category = 'har', subcategory = 'krem', tags = '{"krøller"}' where slug = 'depot-no-310-curl-designer-150-ml';
update products set category = 'har', subcategory = 'krem', tags = '{}' where slug = 'depot-no-316-styling-cream-125-ml';
update products set category = 'har', subcategory = 'krem', tags = '{"krøller"}' where slug = 'matrix-curl-can-dream-gel';
update products set category = 'har', subcategory = 'krem', tags = '{}' where slug = 'reuzel-fiber-cream';
update products set category = 'har', subcategory = 'krem', tags = '{}' where slug = 'reuzel-fiber-gel';
update products set category = 'har', subcategory = 'krem', tags = '{}' where slug = 'reuzel-grooming-cream';
update products set category = 'har', subcategory = 'krem', tags = '{}' where slug = 'uppercut-control-cream';
update products set category = 'har', subcategory = 'krem', tags = '{}' where slug = 'uppercut-texture-cream';
update products set category = 'har', subcategory = 'leire', tags = '{}' where slug = 'reuzel-clay-matte-pomade';
update products set category = 'har', subcategory = 'leire', tags = '{"storpakning"}' where slug = 'reuzel-clay-matte-pomade-340g';
update products set category = 'har', subcategory = 'leire', tags = '{}' where slug = 'reuzel-fiber-pomade';
update products set category = 'har', subcategory = 'leire', tags = '{}' where slug = 'reuzel-matte-styling-paste';
update products set category = 'har', subcategory = 'leire', tags = '{}' where slug = 'slick-gorilla-clay-pomade';
update products set category = 'har', subcategory = 'leire', tags = '{}' where slug = 'slick-gorilla-lightwork';
update products set category = 'har', subcategory = 'leire', tags = '{}' where slug = 'uppercut-clay';
update products set category = 'har', subcategory = 'leire', tags = '{"reise"}' where slug = 'uppercut-clay-midi';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'depot-no-303-modelling-wax-100-ml';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'reuzel-concrete-hold-matte-pomade';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'reuzel-concrete-hold-matte-pomade-309';
update products set category = 'har', subcategory = 'pomade', tags = '{"storpakning"}' where slug = 'reuzel-concrete-hold-matte-pomade-340g';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'reuzel-extreme-hold-matte-pomade';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'reuzel-grease-heavy-hold-pomade';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'reuzel-grease-heavy-hold-pomade-149';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'reuzel-grease-medium-hold-pomade';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'reuzel-high-sheen-pomade';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'reuzel-strong-hold-pomade';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'solomons-hair-wax-cream-pomade-cutler';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'solomons-hair-wax-matte-pomade-ambler';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'solomons-hair-wax-medium-hold-shine-pomade-link-boy';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'tenax-harpomade-ekstra-sterk';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'uppercut-ben-brown-monster-hold';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'uppercut-deluxe-pomade';
update products set category = 'har', subcategory = 'pomade', tags = '{"storpakning"}' where slug = 'uppercut-deluxe-pomade-300g';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'uppercut-easy-hold';
update products set category = 'har', subcategory = 'pomade', tags = '{}' where slug = 'uppercut-matte-pomade';
update products set category = 'har', subcategory = 'pomade', tags = '{"storpakning"}' where slug = 'uppercut-matte-pomade-300g';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'nishman-hair-styling-powder-flaming';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'nishman-hair-styling-powder-fresh-look';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'nishman-hair-styling-powder-gumgum';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'nishman-hair-styling-powder-mattifying';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'nishman-hair-styling-powder-sea-salt';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'nishman-hair-styling-powder-sport';
update products set category = 'har', subcategory = 'pudder', tags = '{"volum","tynt-har"}' where slug = 'o-way-volumizing-root-spray-160ml';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'reuzel-clay-spray';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'reuzel-hair-tonic';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'reuzel-spray-grooming-tonic';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'slick-gorilla-hair-styling-powder';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'uppercut-salt-spray';
update products set category = 'har', subcategory = 'pudder', tags = '{}' where slug = 'uppercut-styling-powder';
update products set category = 'har', subcategory = 'sjampo', tags = '{}' where slug = 'depot-no-101-normalizing-daily-shampoo-250-ml';
update products set category = 'har', subcategory = 'sjampo', tags = '{"tynt-har"}' where slug = 'depot-no-105-invigorating-shampoo-50ml';
update products set category = 'har', subcategory = 'sjampo', tags = '{"fet-hodebunn"}' where slug = 'depot-no-107-white-clay-sebum-control-shampoo-250-ml';
update products set category = 'har', subcategory = 'sjampo', tags = '{"sensitiv"}' where slug = 'depot-no-109-anti-itching-soothing-shampoo-250-ml';
update products set category = 'har', subcategory = 'sjampo', tags = '{"tynt-har"}' where slug = 'solomons-anti-hair-loss-shampoo-shrager';
update products set category = 'skjegg', subcategory = 'bartevoks', tags = '{}' where slug = 'baeburys-moustache-wax';
update products set category = 'skjegg', subcategory = 'bartevoks', tags = '{}' where slug = 'reuzel-the-stache-mustache-wax';
update products set category = 'skjegg', subcategory = 'skjeggbalm', tags = '{}' where slug = 'graabein-beard-balm-lysning';
update products set category = 'skjegg', subcategory = 'skjeggbalm', tags = '{}' where slug = 'graabein-beard-balm-mango-coconut';
update products set category = 'skjegg', subcategory = 'skjeggbalm', tags = '{"sensitiv"}' where slug = 'graabein-skin-and-beard-softener-bris';
update products set category = 'skjegg', subcategory = 'skjeggbalm', tags = '{}' where slug = 'graabein-skin-and-beard-softener-rum-spice';
update products set category = 'skjegg', subcategory = 'skjeggbalm', tags = '{}' where slug = 'graabein-skin-and-beard-softener-skogholt';
update products set category = 'skjegg', subcategory = 'skjeggbalm', tags = '{}' where slug = 'graabein-skin-and-beard-softener-villmark';
update products set category = 'skjegg', subcategory = 'skjeggbalm', tags = '{}' where slug = 'graabein-villmark-beard-balm-30-ml';
update products set category = 'skjegg', subcategory = 'skjeggkam', tags = '{}' where slug = 'beard-monkey-beard-comb';
update products set category = 'skjegg', subcategory = 'skjeggolje', tags = '{}' where slug = 'beard-monkey-licorice-beard-oil';
update products set category = 'skjegg', subcategory = 'skjeggolje', tags = '{}' where slug = 'depot-no-505-conditioning-beard-oil-30-ml';
update products set category = 'skjegg', subcategory = 'skjeggolje', tags = '{}' where slug = 'graabein-beard-oil-rum-and-spice';
update products set category = 'skjegg', subcategory = 'skjeggolje', tags = '{}' where slug = 'graabein-beard-oil-villmark';
update products set category = 'skjegg', subcategory = 'skjeggolje', tags = '{}' where slug = 'proraso-beard-oil-azur-lime-30-ml';
update products set category = 'skjegg', subcategory = 'skjeggolje', tags = '{}' where slug = 'proraso-beard-oil-cypress-vetyver-30-ml';
update products set category = 'skjegg', subcategory = 'skjeggolje', tags = '{}' where slug = 'proraso-beard-oil-wood-and-spice-30-ml';
update products set category = 'skjegg', subcategory = 'skjeggolje', tags = '{"grått-hår"}' where slug = 'solomons-beard-hair-oil-leviathan';
update products set category = 'skjegg', subcategory = 'skjeggvask', tags = '{}' where slug = 'beard-monkey-beard-shampoo-licorice';
update products set category = 'skjegg', subcategory = 'skjeggvask', tags = '{}' where slug = 'depot-no-501-moisturizing-clarifying-beard-shampoo-250-ml';
update products set category = 'skjegg', subcategory = 'skjeggvask', tags = '{}' where slug = 'proraso-beard-wash-azur-lime-200-ml';
update products set category = 'skjegg', subcategory = 'skjeggvask', tags = '{}' where slug = 'proraso-beard-wash-cypress-vetyver-200-ml';
update products set category = 'skjegg', subcategory = 'skjeggvask', tags = '{}' where slug = 'proraso-beard-wash-wood-and-spice-200-ml';
update products set category = 'skjegg', subcategory = 'skjeggvask', tags = '{}' where slug = 'solomons-beard-soap-black-pepper';
update products set category = 'utstyr', subcategory = 'borster', tags = '{}' where slug = 'denman-borste-d4';
update products set category = 'utstyr', subcategory = 'borster', tags = '{}' where slug = 'olivia-garden-blowout-shine-55-mm';
update products set category = 'utstyr', subcategory = 'borster', tags = '{}' where slug = 'shampoo-silicone-brush';
update products set category = 'utstyr', subcategory = 'borster', tags = '{}' where slug = 'wet-brush-pro';
update products set category = 'utstyr', subcategory = 'durag', tags = '{}' where slug = 'durag-hvit';
update products set category = 'utstyr', subcategory = 'durag', tags = '{}' where slug = 'durag-rod';
update products set category = 'utstyr', subcategory = 'kammer', tags = '{}' where slug = 'andis-clibber-comb';
update products set category = 'utstyr', subcategory = 'kammer', tags = '{}' where slug = 'nishman-harkam-042';
update products set category = 'utstyr', subcategory = 'kammer', tags = '{}' where slug = 'nishman-normal-comb';
update products set category = 'utstyr', subcategory = 'kammer', tags = '{}' where slug = 'nishman-styling-comb';
update products set category = 'utstyr', subcategory = 'kammer', tags = '{}' where slug = 'nishman-tooth-comb-gray';
update products set category = 'utstyr', subcategory = 'kammer', tags = '{}' where slug = 'uppercut-delux-groomin-comb';
update products set category = 'utstyr', subcategory = 'klippetilbehor', tags = '{}' where slug = 'andis-premium-metal-clip-guards';
update products set category = 'utstyr', subcategory = 'klippetilbehor', tags = '{}' where slug = 'feather-styling-blade-10-stk';
update products set category = 'utstyr', subcategory = 'klippetilbehor', tags = '{}' where slug = 'wahl-8-guard-pack';
update products set category = 'utstyr', subcategory = 'klippetilbehor', tags = '{}' where slug = 'wahl-senior-replacement-blade';

notify pgrst, 'reload schema';

do $$
declare n int;
begin
  select count(*) into n from products where slug is not null and subcategory is not null;
  raise notice 'Produkter med ny kategori: %', n;
end $$;

commit;
