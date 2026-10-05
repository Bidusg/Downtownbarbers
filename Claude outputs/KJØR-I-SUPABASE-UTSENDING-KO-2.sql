-- Tillegg til kø-utsending: «sist aktiv» per utsending (brukes til å se om
-- bakgrunnsjobben står fast, og dytte den i gang igjen). Idempotent.
alter table marketing_sends add column if not exists updated_at timestamptz;
update marketing_sends set updated_at = coalesce(finished_at, created_at) where updated_at is null;
