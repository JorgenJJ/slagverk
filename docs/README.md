# Dokumentasjon – Slagverksoversikt

Inventar-, mangel- og innkjøpsapp for slagverkseksjonen i **Randaberg Musikkorps**.
Én liten, gratis nettapp som samler utstyrsoversikt, ønskeliste og budsjettplanlegging
på ett sted – tilgjengelig fra mobil og PC.

## Innhold

| Dokument | Hva det dekker |
|---|---|
| [maal.md](maal.md) | Mål, suksesskriterier og hva appen erstatter |
| [arkitektur.md](arkitektur.md) | Komponenter, request-flyt og distribusjon (Cloudflare Workers) |
| [datamodell-og-api.md](datamodell-og-api.md) | D1-skjema og alle API-endepunkter |
| [konsepter.md](konsepter.md) | Tilgang, PWA/offline, eksport, responsivt UI, AI (v2) |
| [design.md](design.md) | Palett (lys + mørk fasit), typografi, skjermstruktur, mørk modus |

## Kjernen på 30 sekunder

- **Frontend:** ren HTML/CSS/JS uten byggesteg, pakket som PWA (installerbar).
- **API:** én Cloudflare Worker (`src/index.js`) med egen ruter for `/api/*`;
  all DB-logikk i `src/db.js`.
- **Database:** Cloudflare **D1** (SQLite), binding `DB`.
- **Statisk innhold:** `public/` serveres via Workers **static assets**.
- **Tilgang:** felles kode (`ACCESS_CODE`) sendt som `x-access-code`-header.
- **Kostnad:** 0 kr/mnd innenfor Cloudflares gratisnivå.

### Hovedfunksjoner

- **Oversikt** over utstyr med multi-select-filtre (kategori/status/kvalitet/merke),
  statistikk og sammenslåing av like rader.
- **Mangler** (mangel/erstatning) med prisspenn og ekspanderbare produktalternativer
  som kan legges rett i en innkjøpsliste.
- **Flere innkjøpslister** med egen sum/budsjett + overordnet sum, eksport per liste.
- **Merker** – register over godkjente leverandører, gruppert per utstyrstype.
- **Generér oversikt** – utskriftsvennlig dokument, filtrerbart på minste status/kvalitet.
- **Prisinnhenting** fra leverandørlenke (server-side, musikk-miljø).
- **AI-assistent** (Haiku tool use, modell konfigurerbar via `AI_MODEL`) som legger
  til / endrer data selv – alltid tilgjengelig nederst på skjermen.

> Konvensjoner for videreutvikling: se [`/CLAUDE.md`](../CLAUDE.md) i reporoten.

> Plattformhistorikk: appen kjørte opprinnelig på Cloudflare **Pages + Pages
> Functions** og ble migrert til **Workers med static assets**. Se
> [arkitektur.md](arkitektur.md#migrering-pages--workers) for hva som endret seg.
