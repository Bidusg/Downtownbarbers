-- =====================================================================
-- NETTBUTIKK – BILDER, RUNDE 2 (produktene som ikke fantes i Fixit)
--   Produsentens / forhandlernes produktbilder på hvit bakgrunn.
--   Settes bare der produktet ikke har bilde fra før.
--   Trykk «Lagre bildene hos oss» i Admin → Produkter etterpå, så kopieres
--   bildene til vår egen lagring (noen nettsider stopper visning av bildene
--   sine på andre sider, så dette steget er viktig).
--   Kjør ETTER KJØR-I-SUPABASE-NETTBUTIKK-BILDER.sql.
-- =====================================================================
begin;

update products set images = array['https://cdn-andiswebcontent.azureedge.net/production/images_and_docs/products/33645-master-premium-metal-clip-comb-set-7-piece-straight.webp'], image_url = 'https://cdn-andiswebcontent.azureedge.net/production/images_and_docs/products/33645-master-premium-metal-clip-comb-set-7-piece-straight.webp' where slug = 'andis-premium-metal-clip-guards' and coalesce(array_length(images, 1), 0) = 0 and image_url is null;
update products set images = array['https://noah.com.au/cdn/shop/products/astra-superior-platinum-double-edge-blades-5pk_3.jpg'], image_url = 'https://noah.com.au/cdn/shop/products/astra-superior-platinum-double-edge-blades-5pk_3.jpg' where slug = 'astra-razor-blades-5-stk' and coalesce(array_length(images, 1), 0) = 0 and image_url is null;
update products set images = array['https://www.captainfawcett.com/cdn/shop/products/www.captainfawcett.com-2369.jpg'], image_url = 'https://www.captainfawcett.com/cdn/shop/products/www.captainfawcett.com-2369.jpg' where slug = 'captain-fawcetts-shaving-soap' and coalesce(array_length(images, 1), 0) = 0 and image_url is null;
update products set images = array['https://shop.rawhair.com.au/cdn/shop/files/feather-styling-razor-replacement-10-standard-blades-blfs-10-4414206.jpg'], image_url = 'https://shop.rawhair.com.au/cdn/shop/files/feather-styling-razor-replacement-10-standard-blades-blfs-10-4414206.jpg' where slug = 'feather-styling-blade-10-stk' and coalesce(array_length(images, 1), 0) = 0 and image_url is null;
update products set images = array['https://www.wahl.co.uk/app/uploads/2022/09/58138-Optimised-Black-Combs-1-8-Hero-1024x1024.jpg'], image_url = 'https://www.wahl.co.uk/app/uploads/2022/09/58138-Optimised-Black-Combs-1-8-Hero-1024x1024.jpg' where slug = 'wahl-8-guard-pack' and coalesce(array_length(images, 1), 0) = 0 and image_url is null;
update products set images = array['https://wahlusa.com/media/catalog/product/3/0/3028043_standard2_blade_hero_1.jpg'], image_url = 'https://wahlusa.com/media/catalog/product/3/0/3028043_standard2_blade_hero_1.jpg' where slug = 'wahl-senior-replacement-blade' and coalesce(array_length(images, 1), 0) = 0 and image_url is null;
update products set images = array['https://cdn.shopify.com/s/files/1/1588/9573/files/WetBrushProDetanglerBlack_1.jpg'], image_url = 'https://cdn.shopify.com/s/files/1/1588/9573/files/WetBrushProDetanglerBlack_1.jpg' where slug = 'wet-brush-pro' and coalesce(array_length(images, 1), 0) = 0 and image_url is null;
update products set images = array['https://www.barberitems.com/cdn/shop/products/20229152158330202111154051WhatsApp_20Image_202021-11-15_20at_2014.40.40.jpg'], image_url = 'https://www.barberitems.com/cdn/shop/products/20229152158330202111154051WhatsApp_20Image_202021-11-15_20at_2014.40.40.jpg' where slug = 'nishman-harkam-042' and coalesce(array_length(images, 1), 0) = 0 and image_url is null;
update products set images = array['https://res.cloudinary.com/odin-systemer/image/upload/c_pad,b_white,w_1000,h_1000/supplierProduct/32590.jpg'], image_url = 'https://res.cloudinary.com/odin-systemer/image/upload/c_pad,b_white,w_1000,h_1000/supplierProduct/32590.jpg' where slug = 'uppercut-delux-groomin-comb' and coalesce(array_length(images, 1), 0) = 0 and image_url is null;
update products set images = array['https://www.johnbeerens.com/cdn/shop/files/Depot_207_2.jpg'], image_url = 'https://www.johnbeerens.com/cdn/shop/files/Depot_207_2.jpg' where slug = 'depot-no-207-white-clay-sebum-control-treatment-125-ml' and coalesce(array_length(images, 1), 0) = 0 and image_url is null;
update products set images = array['https://www.keshop.com/1861-large_default/hair-touch-up-light-brown-75-ml.jpg'], image_url = 'https://www.keshop.com/1861-large_default/hair-touch-up-light-brown-75-ml.jpg' where slug = 'loreal-professionnel-hair-touch-up-light-brown' and coalesce(array_length(images, 1), 0) = 0 and image_url is null;

-- Tekster bekreftet ut fra produktbildene.
update products set web_name = 'Astra Superior Platinum barberblader (5 stk)', content_review = false, content_note = null
 where slug = 'astra-razor-blades-5-stk';
update products set web_name = 'Feather Styling Razor – 10 standardblader', content_review = false, content_note = null
 where slug = 'feather-styling-blade-10-stk';
update products set web_name = 'Andis Master Premium Metal Clip Comb Set (7 stk)', size_label = '7 påsatskammer', content_review = false, content_note = null
 where slug = 'andis-premium-metal-clip-guards';
update products set web_name = 'Wahl Senior 2.0 – reservekniv', content_note = 'Bildet viser kniven til Senior 2.0 – sjekk at det er den dere selger.'
 where slug = 'wahl-senior-replacement-blade';
update products set web_name = 'Wahl påsatskammer #1–8', content_note = 'Bildet viser Wahl sine svarte kammer #1–8.'
 where slug = 'wahl-8-guard-pack';
update products set web_name = 'Captain Fawcett''s Luxurious Shaving Soap', content_note = 'Bildet viser Luxurious Shaving Soap i treskål – sjekk at det er varianten dere selger.'
 where slug = 'captain-fawcetts-shaving-soap';
update products set content_note = 'Bildet viser Uppercut Deluxe CT7 Flip Comb (samme pris) – sjekk at det stemmer.'
 where slug = 'uppercut-delux-groomin-comb';

notify pgrst, 'reload schema';
commit;
