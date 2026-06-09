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

-- ── Seed: godkjente merker (basert på utstyret vi har + leverandører i bruk) ──
INSERT INTO brands (id, name, category, notes, sort_order) VALUES
  ('BR-majestic','Majestic','Melodisk','Rørklokker, konsertskarp', 1),
  ('BR-adams','Adams','Pauker','Pauker, grand casa / konsertstortromme', 2),
  ('BR-yamaha','Yamaha','Stativer','Stikkebord, vibrafon', 3),
  ('BR-pearl','Pearl','Trommer','Trommesett, paukestol, stativer', 4),
  ('BR-sabian','Sabian','Cymbaler','', 5),
  ('BR-zildjian','Zildjian','Cymbaler','', 6),
  ('BR-sela','Sela','Perkusjon','Tam tam, cajon', 7),
  ('BR-meinl','Meinl','Perkusjon','Belltree, perkusjon', 8),
  ('BR-grover','Grover','Perkusjon','Konsert-tamburin', 9);

-- ── Seed: noen alternativer for å demonstrere pris-spenn + ekspandering ──
INSERT INTO wishlist_options (id, wishlist_id, brand, model, size, info, link, price) VALUES
  ('OPT-1','W-2','Adams','Professional Generation II','32"','Hammered copper, cambered','https://www.musikk-miljo.no/pauke-adams-professional-generation-ii-papriidh23l-23-hammered-copper-cambered',78100),
  ('OPT-2','W-2','Majestic','Symphonic','32"','Rimsefritt alternativ','',72000),
  ('OPT-3','W-5','Majestic','Prophonic BK9350','1 1/2 oktav','18 forkrommede rør','https://www.musikk-miljo.no/r%C3%B8rklokker-majestic-prophonic-bk9350-18-tubes-1-12-chromed-tubes',85520);
