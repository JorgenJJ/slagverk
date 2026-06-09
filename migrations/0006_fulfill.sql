-- Slagverksoversikt – migrering 0006
-- Oppfyllelses-flyt: når en mangel kjøpes blir den til inventar, og mangelen
-- fjernes. Utstyr som erstattes merkes «utgått» (skjult i oversikt, bevart).
-- Innkjøpslister kan arkiveres når de er kjøpt. Endrer ikke eksisterende data.
ALTER TABLE inventory ADD COLUMN retired_at TEXT;   -- NULL = aktiv; satt = utgått/erstattet
ALTER TABLE lists ADD COLUMN archived_at TEXT;      -- NULL = aktiv; satt = kjøpt/arkivert
CREATE INDEX IF NOT EXISTS idx_inventory_retired ON inventory(retired_at);
