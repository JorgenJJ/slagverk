-- Slagverksoversikt – migrering 0007
-- Strukturendring: en innkjøpsliste-linje ER et konkret produkt (et alternativ),
-- ikke en mangel. `list_items` re-nøkles til (list_id, option_id). `wishlist_id`
-- beholdes som denormalisert tilbake-referanse til mangelen. Liste-linjer uten
-- konkret produkt (gammelt option_id = NULL) fjernes – de var ikke produkter.

CREATE TABLE list_items_new (
  list_id     TEXT NOT NULL,
  option_id   TEXT NOT NULL,                          -- → wishlist_options.id (produktet)
  wishlist_id TEXT NOT NULL,                          -- → wishlist.id (mangelen, tilbake-ref)
  qty         INTEGER NOT NULL DEFAULT 1,
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (list_id, option_id)
);

INSERT INTO list_items_new (list_id, option_id, wishlist_id, qty, added_at)
  SELECT list_id, option_id, wishlist_id, qty, COALESCE(added_at, datetime('now'))
  FROM list_items
  WHERE option_id IS NOT NULL AND option_id <> '';

DROP TABLE list_items;
ALTER TABLE list_items_new RENAME TO list_items;
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_opt  ON list_items(option_id);
