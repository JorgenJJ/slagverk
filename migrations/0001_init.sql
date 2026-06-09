-- Slagverk Inventar – database schema for Cloudflare D1
-- Run: wrangler d1 migrations apply slagverk-db

DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS wishlist;

CREATE TABLE inventory (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  brand       TEXT DEFAULT '',
  category    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ok',      -- ok | redusert | ødelagt
  quality     TEXT NOT NULL DEFAULT 'ukjent',  -- bra | greit | dårlig | ukjent
  notes       TEXT DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE wishlist (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  category        TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'middels', -- høy | middels | lav
  estimated_price INTEGER,
  link            TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  budgeted        INTEGER NOT NULL DEFAULT 0,       -- 0 | 1
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Seed: nåværende inventar ──
INSERT INTO inventory (id, type, brand, category, status, quality, notes) VALUES
  ('SD-1','Skarptromme','Majestic','Trommer','ok','bra','Konsert'),
  ('BD-1','Stortromme','','Trommer','ok','bra','Marsj'),
  ('XY-1','Xylofon','','Melodisk','ok','dårlig',''),
  ('VB-1','Vibrafon','','Melodisk','redusert','ukjent','Kan muligens repareres'),
  ('GL-1','Klokkespill','','Melodisk','ok','greit',''),
  ('TT-1','Tam tam','Sela','Cymbaler','ok','bra','36"'),
  ('TP-1','Pauke 29"','','Pauker','redusert','ukjent','Usikkert mål, kan repareres'),
  ('TP-2','Pauke 26"','','Pauker','redusert','ukjent','Usikkert mål, kan repareres'),
  ('BG-1','Bongos','','Trommer','ok','bra',''),
  ('PT-1','Stikkebord','Yamaha','Stativer','ok','bra',''),
  ('PT-2','Stikkebord','Yamaha','Stativer','ok','bra',''),
  ('AC-1','A2 cymbal','Sabian','Cymbaler','ok','bra',''),
  ('CY-1','Suspended cymbal','Zildjian','Cymbaler','ok','bra',''),
  ('CY-2','Suspended cymbal','Zildjian','Cymbaler','ok','bra',''),
  ('DK-1','Trommesett','Pearl','Trommer','ok','dårlig','Trenger nye skinn');

-- ── Seed: mangler / ønskeliste ──
INSERT INTO wishlist (id, type, category, priority, estimated_price, link, notes, budgeted) VALUES
  ('W-1','Grand casa','Trommer','høy',32800,'https://www.musikk-miljo.no/konsertstortromme-adams-bdiif3218-32x18-generation-ii-free-suspended-stand','',0),
  ('W-2','Pauke 32"','Pauker','høy',78100,'https://www.musikk-miljo.no/pauke-adams-professional-generation-ii-papriidh23l-23-hammered-copper-cambered','Ikke helt lik modell',0),
  ('W-3','Pauke 23"','Pauker','høy',72200,'https://www.musikk-miljo.no/pauke-adams-professional-generation-ii-papriidh32l-32-hammered-copper-cambered','Ikke helt lik modell',0),
  ('W-4','Vibrafon (ny)','Melodisk','middels',99500,'https://www.musikk-miljo.no/vibrafon-yamaha-yv-2700g-3-octaves-f3-f6-gold-finish-39-57x13mm-staver','Alternativt reparer eksisterende',0),
  ('W-5','Rørklokker','Melodisk','middels',85520,'https://www.musikk-miljo.no/r%C3%B8rklokker-majestic-prophonic-bk9350-18-tubes-1-12-chromed-tubes','',0),
  ('W-6','Paukestol','Pauker','lav',7700,'https://www.musikk-miljo.no/paukestol-pearl-d-3000tc-timpani-throne','',0),
  ('W-7','Belltree','Perkusjon','lav',5600,'https://www.musikk-miljo.no/bell-tree-meinl-bt27-stand-alone-bell-tree','',0),
  ('W-8','Konsert-tamburin','Perkusjon','lav',4565,'https://www.musikk-miljo.no/tamburin-grover-t2gs-german-silver-jingles-mbag-10-calf-head','',0),
  ('W-9','Congas','Trommer','lav',NULL,'','',0);
