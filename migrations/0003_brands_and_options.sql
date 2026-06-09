-- Slagverksoversikt – migrering 0003
-- Legger til: register over godkjente merker, og pris-/produktalternativer per
-- mangel (slik at en mangel kan ha flere konkrete produkter å velge mellom).
-- Endrer ikke eksisterende data.

-- ── Godkjente merker (foretrukne leverandører, gruppert etter utstyrstype) ──
CREATE TABLE IF NOT EXISTS brands (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'Generelt',   -- hva merket er foretrukket innen
  notes       TEXT DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Produkt-/prisalternativer for en mangel ──
CREATE TABLE IF NOT EXISTS wishlist_options (
  id          TEXT PRIMARY KEY,
  wishlist_id TEXT NOT NULL,
  brand       TEXT DEFAULT '',
  model       TEXT DEFAULT '',
  size        TEXT DEFAULT '',
  info        TEXT DEFAULT '',
  link        TEXT DEFAULT '',
  price       INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wopt_wish ON wishlist_options(wishlist_id);

-- En liste-linje kan peke på et konkret alternativ (valgfritt).
ALTER TABLE list_items ADD COLUMN option_id TEXT;
