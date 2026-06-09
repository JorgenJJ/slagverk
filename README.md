# Slagverk Inventar – Randaberg Musikkorps

Inventar-, mangel- og innkjøpsapp for slagverkseksjonen. Kjører som **Cloudflare
Pages** (statisk PWA-frontend) + **Pages Functions** (API) + **D1** (database).
Ingen byggesteg – frontend er ren HTML/CSS/JS.

Total driftskostnad: **0 kr/mnd** innenfor Cloudflares gratisnivå.

---

## Arkitektur

```
public/            ← PWA-frontend (serveres statisk)
  index.html
  app.js           ← all app-logikk (vanilla JS)
  styles.css       ← responsiv: tabell på desktop, kort på mobil
  sw.js            ← service worker (offline-skall)
  manifest.webmanifest
functions/api/     ← Pages Functions = API-laget (kjører som Worker)
  login.js         POST   /api/login
  inventory.js     GET/POST   /api/inventory
  inventory/[id].js PUT/DELETE /api/inventory/:id
  wishlist.js      GET/POST   /api/wishlist
  wishlist/[id].js PUT/DELETE /api/wishlist/:id
  chat.js          POST   /api/chat   (AI – v2, krever AI_API_KEY)
migrations/0001_init.sql  ← skjema + nåværende data
wrangler.toml
```

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
Kopier `database_id` fra utskriften inn i `wrangler.toml` (erstatt
`ERSTATT_MED_DIN_DATABASE_ID`). Commit og push endringen.

### 3. Kjør migreringen (legger inn skjema + dagens utstyr)
```bash
npx wrangler d1 migrations apply slagverk-db --remote
```

### 4. Opprett Pages-prosjektet i Cloudflare
- Dashboard → **Workers & Pages → Create → Pages → Connect to Git**
- Velg repoet. Build-innstillinger:
  - **Build command:** _(tomt)_
  - **Build output directory:** `public`
- Deploy. Du får en adresse som `slagverk-inventar.pages.dev`.

### 5. Koble D1 til Pages-prosjektet
Pages-prosjekt → **Settings → Functions → D1 database bindings**:
- Variable name: `DB`  →  Database: `slagverk-db`

### 6. Sett tilgangskoden
Pages-prosjekt → **Settings → Environment variables (Production)**:
- `ACCESS_CODE` = koden seksjonen skal bruke (marker som **Secret**)

Redeploy (Deployments → Retry deployment) så bindingene tas i bruk. Ferdig.

---

## Lokal utvikling
```bash
npx wrangler d1 migrations apply slagverk-db --local
echo 'ACCESS_CODE = "test"' > .dev.vars
npm run dev
```

---

## Aktivere AI-chatten (v2)
1. Skaff en Anthropic API-nøkkel (console.anthropic.com).
2. Pages → Settings → Environment variables → legg til secret `AI_API_KEY`.
3. Redeploy. AI-fanen blir aktiv. Modellen får gjeldende inventar som kontekst
   og kan foreslå endringer; utvid `chat.js` + frontend til å utføre forslagene
   automatisk hvis ønskelig.

Kostnad: Claude Haiku ≈ brøkdeler av et øre per melding.

---

## Eksport
Knappene i **Innkjøp**-fanen lager `.xlsx` (SheetJS) og `.csv` direkte i
nettleseren – CSV åpnes rett i både Excel og Google Sheets.
