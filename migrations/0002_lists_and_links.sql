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
