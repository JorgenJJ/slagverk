-- Slagverksoversikt – migrering 0004
-- Legger til modell og størrelse på inventar (vises bl.a. i generert oversikt).
ALTER TABLE inventory ADD COLUMN model TEXT DEFAULT '';
ALTER TABLE inventory ADD COLUMN size  TEXT DEFAULT '';
