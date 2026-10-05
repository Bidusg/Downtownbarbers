-- Visningsnavn på ansatte: det kundene ser i Teamet og i booking.
-- Tomt = fullt navn. Idempotent.
alter table staff add column if not exists display_name text;
comment on column staff.display_name is 'Navn vist til kunder (forside/booking). NULL = full_name.';
