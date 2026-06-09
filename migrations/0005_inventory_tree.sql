-- Slagverksoversikt – migrering 0005
-- Lar utstyr ha deler/underdeler (komponent-tre): et trommesett kan inneholde
-- trommer/cymbaler/pedal, hver tromme kan ha skinn osv. Selv-refererende via
-- parent_id (NULL = toppnivå). Vilkårlig dybde. Endrer ikke eksisterende data.
ALTER TABLE inventory ADD COLUMN parent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_inventory_parent ON inventory(parent_id);
