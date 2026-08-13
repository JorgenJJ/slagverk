-- Et merke kan være foretrukket innen FLERE kategorier (f.eks. Majestic både
-- innen Trommer og Melodisk). `categories` er en JSON-array og er kanonisk form.
--
-- `category` beholdes som speil av FØRSTE kategori, slik at eldre rader (som bare
-- har `category`), sorteringen i listBrands og AI-verktøyenes enum fortsatt virker
-- uten datamigrering. Les alltid via brandCategories() i src/db.js.
ALTER TABLE brands ADD COLUMN categories TEXT;
