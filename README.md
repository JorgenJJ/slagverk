# Slagverk Inventar – Randaberg Musikkorps

Inventar-, mangel- og innkjøpsapp for slagverkseksjonen. Kjører som én **Cloudflare
Worker** med **static assets** (statisk PWA-frontend) + **D1** (database). Ingen
byggesteg – frontend er ren HTML/CSS/JS.

Total driftskostnad: **0 kr/mnd** innenfor Cloudflares gratisnivå.

📖 Utfyllende dokumentasjon i [`docs/`](docs/README.md) (arkitektur, datamodell, konsepter, mål).

---

## Arkitektur

```
public/            ← PWA-frontend (Workers static assets)
  index.html
  app.js           ← all app-logikk (vanilla JS)
  styles.css       ← responsiv: tabell på desktop, kort på mobil
  sw.js            ← service worker (offline-skall)
  manifest.webmanifest
src/               ← Worker = API-laget
  index.js         ← fetch-inngangspunkt + ruter for /api/*
  helpers.js       ← json/err/checkAuth/newId
  routes/          ← login, inventory, wishlist, chat
migrations/0001_init.sql  ← skjema + nåværende data
wrangler.toml
```

API-ruter: `POST /api/login`, `GET|POST /api/inventory`, `PUT|DELETE
/api/inventory/:id`, `GET|POST /api/wishlist`, `PUT|DELETE /api/wishlist/:id`,
`POST /api/chat` (AI – v2). Alt annet serveres som static assets.

Tilgang er beskyttet av én **felles kode** (secret `ACCESS_CODE`). Frontend sender
den som `x-access-code`-header. Enkelt og passende for «noen få i seksjonen».

---

## Engangsoppsett (≈15 min)

Forutsetter at GitHub-kontoen din allerede er koblet til Cloudflare.

### 1. Legg repoet på GitHub
```bash
git init && git add . && git commit -m "Slagverk inventar"
git remote add origin git@github.com:<deg>/slagverk-inventar.git
git push -u origin main
```

### 2. Opprett D1-databasen
```bash
npm install
npx wrangler d1 create slagverk-db
```
Kopier `database_id` fra utskriften inn i `wrangler.toml` (feltet finnes allerede
under `[[d1_databases]]`). Commit og push endringen.

### 3. Kjør migreringen (legger inn skjema + dagens utstyr)
```bash
npx wrangler d1 migrations apply slagverk-db --remote
```

### 4. Opprett Worker-prosjektet i Cloudflare
Velg **én** av:

- **Git-tilkoblet (anbefalt):** Dashboard → **Workers & Pages → Create →
  Workers → Connect to Git (Workers Builds)** → velg repoet. Hver `git push`
  bygger og distribuerer automatisk. La build-kommando stå tom.
- **Direkte fra maskin:** `npx wrangler deploy`.

Du får en adresse som `slagverk-inventar.<konto>.workers.dev`.

### 5. Bekreft D1-bindingen
Worker-prosjekt → **Settings → Bindings**: `DB` skal peke på `slagverk-db`.
(Definert i `wrangler.toml`; bekreft at den er aktiv etter første deploy.)

### 6. Sett tilgangskoden
```bash
npx wrangler secret put ACCESS_CODE
```
…eller i dashbordet: Worker → **Settings → Variables and Secrets** → legg til
`ACCESS_CODE` som **Secret**. Redeploy om nødvendig. Ferdig.

---

## Lokal utvikling
```bash
npx wrangler d1 migrations apply slagverk-db --local
echo 'ACCESS_CODE = "test"' > .dev.vars
npm run dev          # wrangler dev → http://127.0.0.1:8787
```

---

## Aktivere AI-chatten (v2)
1. Skaff en Anthropic API-nøkkel (console.anthropic.com).
2. Sett secret: `npx wrangler secret put AI_API_KEY` (eller via dashbordet).
3. Redeploy. AI-fanen blir aktiv. Modellen får gjeldende inventar som kontekst
   og kan foreslå endringer; utvid `src/routes/chat.js` + frontend til å utføre
   forslagene automatisk hvis ønskelig.

Kostnad: Claude Haiku ≈ brøkdeler av et øre per melding.

---

## Eksport
Knappene i **Innkjøp**-fanen lager `.xlsx` (SheetJS) og `.csv` direkte i
nettleseren – CSV åpnes rett i både Excel og Google Sheets.
