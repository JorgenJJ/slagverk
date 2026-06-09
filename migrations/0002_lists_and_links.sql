-- Slagverksoversikt – migrering 0002
-- Legger til: flere innkjøpslister, kobling mangel→innkjøpsliste,
-- og kobling mangel→utstyr-den-erstatter. Endrer ikke eksisterende data.

-- ── Kobling: en mangel kan være erstatning for et eksisterende utstyr ──
ALTER TABLE wishlist ADD COLUMN replaces_inventory_id TEXT;

-- ── Innkjøpslister (navngitte, hver med egen sum/prioritet/eksport) ──
CREATE TABLE IF NOT EXISTS lists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  budget      INTEGER,                              -- valgfritt budsjett per liste
  notes       TEXT DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Innhold i listene (mange-til-mange: en mangel kan ligge i flere lister) ──
CREATE TABLE IF NOT EXISTS list_items (
  list_id     TEXT NOT NULL,
  wishlist_id TEXT NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1,
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (list_id, wishlist_id)
);

CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_wish ON list_items(wishlist_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_replaces ON wishlist(replaces_inventory_id);

-- ── Seed: én eksempelliste + koblinger som viser hvordan ting henger sammen ──
INSERT INTO lists (id, name, sort_order, budget, notes) VALUES
  ('L-1','Prioritert 2026', 0, 100000, 'Høyest prioriterte innkjøp');

INSERT INTO list_items (list_id, wishlist_id, qty) VALUES
  ('L-1','W-1',1),   -- Grand casa
  ('L-1','W-2',1),   -- Pauke 32"
  ('L-1','W-3',1);   -- Pauke 23"

-- Vibrafon (ny) er erstatning for den reduserte vibrafonen vi har (VB-1)
UPDATE wishlist SET replaces_inventory_id = 'VB-1' WHERE id = 'W-4';
