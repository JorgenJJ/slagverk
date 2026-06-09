-- Slagverksoversikt – database schema for Cloudflare D1
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
