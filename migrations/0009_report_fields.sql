-- Rapportkontroll: per element (ekskluder) + per rot (antall barnenivåer i rapporten).
ALTER TABLE inventory ADD COLUMN report_excluded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory ADD COLUMN report_depth INTEGER NOT NULL DEFAULT 0;
