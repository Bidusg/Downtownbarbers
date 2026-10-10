-- ============================================================================
-- ARKIVERING AV UTSENDINGSHISTORIKK (marketing_sends)
-- ----------------------------------------------------------------------------
-- Legger til én kolonne som lar deg SKJULE utsendinger fra loggen uten å
-- slette dataene. Arkiverte rader ligger fortsatt i databasen, så systemets
-- oversikt over «hvem har fått e-posten» (brukt av «Send til resten») er
-- fortsatt intakt. Du kan gjenopprette en arkivert rad når som helst.
--
-- Trygt å kjøre flere ganger (IF NOT EXISTS).
-- ============================================================================

alter table public.marketing_sends
  add column if not exists archived_at timestamptz;

-- Rask filtrering av aktive (ikke-arkiverte) rader i loggen.
create index if not exists idx_marketing_sends_archived
  on public.marketing_sends (archived_at)
  where archived_at is null;

-- Ferdig. Loggen viser nå kun aktive utsendinger; arkiverte finner du under
-- «Vis arkiverte» og kan gjenopprettes derfra.
