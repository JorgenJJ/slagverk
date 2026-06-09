# CLAUDE.md – konvensjoner for Slagverk-appen

Sentral oversikt for AI-agenter (og mennesker) som skal videreutvikle denne
appen. **Les denne før du implementerer.** Utdypende dokumentasjon i [`docs/`](docs/README.md).

## Hva dette er

Inventar-, mangel- og innkjøpsapp for slagverkseksjonen i Randaberg Musikkorps.
Én Cloudflare **Worker** serverer et statisk PWA-frontend (`public/`) + et lite
JSON-API under `/api/*`, med **D1** (SQLite) som database. **Ingen byggesteg** –
frontend er ren HTML/CSS/JS. Mål: 0 kr/mnd, lav friksjon å registrere endringer
(gjerne via AI), appen brukes ellers til å se gjennom og eksportere.

## Filkart – hvor ting hører hjemme

```
src/index.js          Worker-entry: fetch() + rutetabell for /api/*
src/helpers.js        json/err/checkAuth/requireAuth/newId
src/db.js             ALL DB-logikk (delt av REST-ruter OG AI-verktøy)
src/routes/*.js       tynne HTTP-wrappere over db.js (login, inventory, wishlist,
                      lists, brands, options, price, chat)
migrations/000N_*.sql D1-skjema/seed (additivt – se under)
public/index.html     skall (laster app.js + fonts + SheetJS)
public/app.js         hele frontend (state + render(), vanilla JS)
public/styles.css     tema (CSS-variabler øverst)
public/sw.js          service worker (network-first skall)
wrangler.toml         Worker + [assets]=public/ + D1-binding DB
```

## Gjennomgående regler

- **Legg ALL datalogikk i `src/db.js`.** Ruter og AI-verktøy skal kalle de samme
  funksjonene – aldri duplisere SQL. Funksjoner kaster `ValidationError` ved
  ugyldig input; kallere mapper til HTTP 400 / tool_result-feil.
- **Auth:** hvert endepunkt starter med `requireAuth(request, env)`. Klienten
  sender felles kode i `x-access-code`. Ingen per-bruker-pålogging.
- **Feilkoder:** 400 validering, 401 tilgang, 404 ukjent id/sti, 405 feil metode,
  502 ekstern tjeneste. Feilsvar: `{ "error": "<melding>" }`.
- **Språk:** alt brukervendt er på **norsk (bokmål)**. Kode/kommentarer norsk er ok.
- **Enums (må holdes i synk frontend ↔ DB ↔ AI-verktøy):**
  - kategori: `Trommer | Melodisk | Pauker | Cymbaler | Stativer | Perkusjon`
  - status: `ok | redusert | ødelagt`
  - kvalitet: `bra | greit | dårlig | ukjent`
  - prioritet: `høy | middels | lav`

## ID-er

- Genereres **kun** med `newId(prefix)` (opak `crypto.randomUUID()` med kort
  prefiks, f.eks. `INV-`, `W-`, `L-`, `BR-`, `OPT-`).
- ID-er er **ugjennomsiktige** – ikke tolk eller parse dem, og **ikke vis dem i
  UI**. (Eldre seed har semantiske id-er som `SD-1`; de er fortsatt gyldige, men
  nye skal være UUID.)
- TEXT primærnøkkel overalt. Referanser ryddes i app-logikk (D1 håndhever ikke FK
  by default), se sletterutinene i `db.js`.

## Datamodell (D1)

`inventory` (utstyr) · `wishlist` (mangler, `replaces_inventory_id` → inventory) ·
`wishlist_options` (produkt-/prisalternativer per mangel) · `lists` (innkjøps­lister)
· `list_items` (m2m liste↔mangel, valgfri `option_id`) · `brands` (godkjente merker).
Full tabell-spec: [docs/datamodell-og-api.md](docs/datamodell-og-api.md).

## Slik legger du til …

- **Et felt på en tabell:** ny migrering `migrations/000N_*.sql` med
  `ALTER TABLE … ADD COLUMN`; legg feltet i riktig `*_FIELDS`-liste i `db.js`.
- **Et endepunkt:** funksjon i `db.js` → tynn handler i `src/routes/*.js` →
  registrer i `ROUTES` i `src/index.js` (mer spesifikke mønstre **før** generelle).
- **Et AI-verktøy:** legg til i `TOOLS` + `runTool()` i `src/routes/chat.js`
  (kall samme `db.js`-funksjon), og returner et `action`-objekt for angre.
- **En frontend-fane:** legg i `TABS`, lag en `viewX()` som returnerer HTML-streng,
  koble i `render()`, og legg event-hooks i `wire()`.

## Frontend-konvensjoner (`public/app.js`)

- Arkitektur: ett globalt `state`-objekt + `render()` som bygger hele `#root` på
  nytt, deretter `wire()` som kobler events via `data-*`-attributter.
- **Escape all brukerdata med `esc()`** i HTML-strenger (XSS).
- Responsivt: `<table>` på desktop, `.cards` på mobil (≤720px) – render begge,
  CSS skjuler den som ikke gjelder. `.desktop-only` / `.mobile-only` finnes.
- AI-chatten er en **docket bar nederst** (ikke en fane), alltid tilgjengelig;
  håndterer tastatur via `visualViewport` (`applyDockViewport`).
- Like rader i Oversikt **grupperes** (`groupKey`) med antall + ekspandering.
- Ingen rammeverk, ingen build. Hold det slik.

## AI-assistenten

- `POST /api/chat`: Haiku med **tool use**. Modellen får data som kontekst +
  verktøy, utfører endringer **direkte** (ikke foreslå-bekreft) og returnerer
  `actions` som frontend kan **angre**.
- Modell settes med env/secret **`AI_MODEL`** (fallback i `chat.js`). Bytt til en
  Sonnet-id for høyere presisjon mot høyere pris. Krever `AI_API_KEY`.

## Tema / design

- CSS-variabler øverst i `styles.css`. Palett: pergament `--paper`, korpsrødt
  `--red` (signal, ikke flatefyll), messing `--brass`. Fonter: Fraunces (display)
  + Hanken Grotesk (UI). **Ikke** grelle farger i UX.
- Logo: `public/randaberg-logo.png` (farge) + transparente linje-varianter
  `randaberg-logo-white.png` (hvit, for rød bakgrunn) og `-red.png` (rød, for lys
  bakgrunn), generert med `node scripts/make-logo-variants.js`. Bruk
  `logo(size, variant)` med `"full" | "white" | "red"` (SVG-skjold som fallback).
  PWA-ikon `icon-192/512.png` genereres fra logoen med sharp.

## Service worker

`public/sw.js` er **network-first** for skallet (nye versjoner lastes når online,
offline-fallback fra cache). `/api/*` går alltid rett til nett. Bump `CACHE`-navnet
kun hvis du må tvinge full invalidasjon.

## Migreringer

- **Aldri** rediger en migrering som er kjørt mot remote. Legg ny `000N_*.sql`.
- Vær additiv (`ADD COLUMN`, `CREATE TABLE IF NOT EXISTS`) så remote-data bevares.
- Etter ny migrering: `npm run db:migrate:local` (lokalt) og
  `npm run db:migrate` (remote, ved deploy).

## Lokal kjøring & deploy

```bash
npm run dev            # wrangler dev → http://127.0.0.1:8787 (.dev.vars: ACCESS_CODE)
npm run db:migrate:local
```
Deploy: push til `main` → Cloudflare Workers Builds (`npx wrangler deploy`).
Secrets settes på Worker-en (ikke i git): `ACCESS_CODE` (påkrevd), `AI_API_KEY`,
`AI_MODEL` (valgfri). Kjør remote-migrering ved skjemaendringer.

## Verifisering før du sier deg ferdig

1. `node --check public/app.js` (frontend-syntaks).
2. `npx wrangler deploy --dry-run` (Worker bygger).
3. Ved skjemaendring: `npm run db:migrate:local`, så røyk-test endepunktene.
4. Bump ev. `sw.js`-cache ikke nødvendig (network-first), men husk at en kjørende
   PWA kan ha gammelt skall – hard refresh ved lokal UI-testing.
