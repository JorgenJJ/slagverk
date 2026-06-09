# Dokumentasjon – Slagverk Inventar

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

## Kjernen på 30 sekunder

- **Frontend:** ren HTML/CSS/JS uten byggesteg, pakket som PWA (installerbar).
- **API:** én Cloudflare Worker (`src/index.js`) med egen ruter for `/api/*`.
- **Database:** Cloudflare **D1** (SQLite), binding `DB`.
- **Statisk innhold:** `public/` serveres via Workers **static assets**.
- **Tilgang:** felles kode (`ACCESS_CODE`) sendt som `x-access-code`-header.
- **Kostnad:** 0 kr/mnd innenfor Cloudflares gratisnivå.

> Plattformhistorikk: appen kjørte opprinnelig på Cloudflare **Pages + Pages
> Functions** og ble migrert til **Workers med static assets**. Se
> [arkitektur.md](arkitektur.md#migrering-pages--workers) for hva som endret seg.
