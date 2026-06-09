# Arkitektur

Appen kjører i sin helhet på Cloudflare: én **Worker** serverer både statisk
frontend og et lite JSON-API, med **D1** (SQLite) som database. Ingen byggesteg –
frontend er ren HTML/CSS/JS.

## Komponenter

```
public/                     ← PWA-frontend (Workers static assets)
  index.html                  app-skall + service worker-registrering
  app.js                      all app-logikk (vanilla JS, ingen rammeverk)
  styles.css                  responsiv: tabell på desktop, kort på mobil
  sw.js                       service worker (offline-skall; /api/* går alltid til nett)
  manifest.webmanifest        PWA-manifest (installerbar)
  icon-192.png / icon-512.png app-ikoner

src/                        ← Worker (API-laget)
  index.js                    fetch-inngangspunkt + ruter for /api/*
  helpers.js                  json(), err(), checkAuth(), requireAuth(), newId()
  db.js                       all lese-/skrivelogikk (delt av REST + AI-verktøy)
  routes/
    login.js                  POST   /api/login
    inventory.js              GET/POST /api/inventory, PUT/DELETE /api/inventory/:id
    wishlist.js               GET/POST /api/wishlist,  PUT/DELETE /api/wishlist/:id
    lists.js                  CRUD /api/lists (+ /:id/items) – innkjøpslister
    brands.js                 CRUD /api/brands – godkjente merker
    options.js                /api/wishlist/:id/options, /api/options/:id – alternativer
    price.js                  POST /api/price – henter pris fra leverandørlenke
    chat.js                   POST /api/chat  – Haiku med tool use (krever AI_API_KEY)

migrations/
  0001_init.sql               D1-skjema + seed (inventar + mangler)
  0002_lists_and_links.sql    innkjøpslister, list_items, replaces_inventory_id
  0003_brands_and_options.sql godkjente merker, mangel-alternativer, option_id
wrangler.toml               ← Worker-, assets- og D1-konfigurasjon
```

## Request-flyt

Cloudflares plattform sjekker først om forespørselen matcher en statisk fil i
`public/`. Hvis ja, serveres filen direkte (Worker-en kjører ikke). Hvis nei,
sendes forespørselen til Worker-ens `fetch`-handler:

```
Forespørsel
   │
   ├─ matcher fil i public/ ───────────────► serveres statisk (index.html, app.js, …)
   │
   └─ ingen treff ──► src/index.js fetch()
                         │
                         ├─ /api/* ──► ruter ──► routes/*  ──► D1 (env.DB)
                         │                         │
                         │                         └─ requireAuth() sjekker x-access-code
                         │
                         └─ alt annet ──► env.ASSETS.fetch() ──► SPA-fallback (index.html)
```

- **Ruteren** (`src/index.js`) er en liten tabell av `{method, regex, handler}`.
  `:id`-ruter fanger siste stisegment og sender det videre som `params.id`.
  Ukjent sti under `/api/` gir `404`; feil HTTP-metode på en kjent sti gir `405`.
- **Static assets** er konfigurert med `not_found_handling =
  "single-page-application"`, så ukjente stier (utenom `/api/`) faller tilbake til
  `index.html`. Bindingen `ASSETS` lar Worker-en hente assets ved fallthrough.
- **Datatilgang** er samlet i `src/db.js`. Både REST-rutene og AI-chattens
  verktøy (tool use) bruker nøyaktig de samme funksjonene, så manuell redigering
  og AI-styrt redigering oppfører seg likt.

## Design

Visuelt tema er hentet fra Randaberg-merket (rødt skjold, hvitt, est. 1979):
«regimental heritage». Pergament-papir som flate, dempet korpsrødt som signal
(header, aktiv fane, primærknapp – ikke som store fargeflater), messing/gull som
heritage-aksent (pris, detaljer). Typografi: **Fraunces** (display) + **Hanken
Grotesk** (UI). Et inline-SVG-skjold med perkusjon-motiv brukes som logo. Målet er
rolig, lesbart UI – ikke grelle farger.

## Distribusjon

- Hosting: én Cloudflare Worker (`wrangler deploy` eller Git-tilkobling i
  dashbordet → automatisk bygg ved hver push).
- Database: D1 `slagverk-db`, binding `DB` (samme binding lokalt og i sky).
- Hemmeligheter: `ACCESS_CODE` (påkrevd for reell beskyttelse), `AI_API_KEY`
  (valgfri, aktiverer v2-chatten). Settes som Worker-secrets.
- Lokal kjøring: `wrangler dev` (port **8787**) med Miniflare; lokale vars i
  `.dev.vars`, lokal D1 via `--local`-migrering.

## Migrering: Pages → Workers

Appen kjørte opprinnelig på Cloudflare **Pages** med **Pages Functions**
(filbasert ruting under `functions/api/`). Den er migrert til **Workers med static
assets**, plattformen Cloudflare nå anbefaler for nye prosjekter. Funksjonell
paritet – samme oppførsel, kun ny innpakning.

| | Før (Pages) | Nå (Workers) |
|---|---|---|
| API-ruting | filbasert (`functions/api/...`) | én Worker + egen ruter (`src/index.js`) |
| Handler-signatur | `onRequestGet({ request, env, params })` | `handler(request, env, params)` |
| Statisk innhold | `pages_build_output_dir = "public"` | `[assets]`-blokk → `public/` |
| Lokal dev | `wrangler pages dev` (port 8788) | `wrangler dev` (port 8787) |
| Deploy | `wrangler pages deploy public` | `wrangler deploy` |
| D1-binding `DB` | uendret | uendret |

SQL, hjelpefunksjoner (`checkAuth`, `json`, `err`, `newId`) og auth-modellen er
uendret. `functions/`-katalogen er fjernet; Pages-versjonen ligger i git-historikk
som tilbakefallspunkt.
