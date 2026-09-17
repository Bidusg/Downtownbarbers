-- =====================================================================
-- 0039 – Postnummer på ansatt.
--   Brukes som passord til den passordbeskyttede ZIP-en som lønnslippen
--   sendes i på e-post. Redigeres av admin i ansatt-panelet.
--   Leses server-side via `staff_public_read` (aktive ansatte).
-- Idempotent.
-- =====================================================================

alter table staff add column if not exists postnummer text;
