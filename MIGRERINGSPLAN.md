# Slagverksoversikt – Mål, bakgrunn og migreringsplan

**Randaberg Musikkorps – slagverkseksjonen**
Versjon 1.0 · Planutkast til godkjenning

---

## 1. Sammendrag

Slagverkseksjonen holder i dag oversikt over utstyr, mangler og innkjøp i tre
løse Google Drive-dokumenter. Denne planen beskriver hvordan disse erstattes av
én liten, gratis nettapplikasjon som samler alt på ett sted, kan nås fra mobil
og PC, og som er enkel å vedlikeholde over tid.

Selve applikasjonen er allerede bygget og testet. Denne planen dekker det
gjenstående steget: å konvertere den fra **Cloudflare Pages** til
**Cloudflare Workers med static assets**, som er plattformen Cloudflare nå
anbefaler for alle nye prosjekter. Koden endrer ikke funksjonalitet – kun måten
den pakkes og distribueres på.

---

## 2. Mål med applikasjonen

### 2.1 Hovedmål

Gi slagverkseksjonen ett samlet, alltid oppdatert verktøy for å:

1. **Se hva vi har** – komplett inventar med tilstand og kvalitet på hvert
   instrument, filtrerbart på kategori og status.
2. **Se hva vi mangler** – ønskeliste over manglende utstyr og oppgraderinger,
   sortert etter prioritet, med prisestimater og lenker til leverandør.
3. **Planlegge innkjøp** – legge inn et budsjett, huke av hva som skal kjøpes,
   og se umiddelbart om planen holder seg innenfor rammen.
4. **Dele og rapportere** – eksportere alt til Excel eller Google Sheets for
   budsjettmøter, søknader om midler eller styrebehandling.

### 2.2 Sekundærmål

- **Tilgjengelig fra flere steder.** Data ligger sentralt på nett, ikke på én
  PC eller i ett dokument. Flere i seksjonen kan se og redigere det samme.
- **Fungerer på mobil og PC.** Installerbar som app (PWA) på telefon, og kjører
  like godt i nettleser på en stasjonær maskin. Grensesnittet tilpasser seg
  skjermstørrelsen (tabell på PC, kortvisning på mobil).
- **Lav terskel.** Beskyttet med én felles tilgangskode for seksjonen – ingen
  bruker­administrasjon å vedlikeholde.
- **Tilnærmet gratis drift.** Skal ligge innenfor Cloudflares gratisnivå, altså
  0 kr/mnd ved normal bruk for et korps.

### 2.3 Planlagt for senere (v2)

- **AI-assistent** for å legge inn og finne data ved hjelp av naturlig språk
  («legg til en ny Sabian-cymbal i god stand»), og for raske oppslag mot
  utvalgte leverandørsider. Grensesnittet er allerede på plass, men funksjonen
  aktiveres først når en API-nøkkel legges inn. Holdt utenfor v1 bevisst.

### 2.4 Suksesskriterier

Applikasjonen regnes som vellykket når:

- All informasjon fra de tre Drive-dokumentene finnes i appen og stemmer.
- Minst to personer i seksjonen kan logge inn og redigere fra hver sin enhet.
- En oppdatering gjort på mobil er synlig på PC umiddelbart.
- Eksport til Excel/Sheets gir et brukbart regneark til budsjettarbeid.
- De gamle Drive-dokumentene kan arkiveres uten tap av informasjon.

---

## 3. Hva applikasjonen erstatter

I dag ligger informasjonen i mappen **Korps → Randaberg slagverk** som tre
separate dokumenter. Tabellen under viser hva hvert dokument inneholder og hvor
innholdet havner i den nye løsningen.

| Dagens Drive-dokument | Type | Innhold i dag | Erstattes av |
|---|---|---|---|
| **Slagverksoversikt** | Google Dokument | Fritekst-oppsummering av beholdningen, gruppert i melodisk / trommer / perkusjon / cymbaler, med en kontaktnotis og merknad om oppgradering | Fanen **Oversikt** – samme informasjon, men strukturert per instrument med status og kvalitet, og filtrerbar |
| **Utstyrsliste** | Google Regneark | To deler: utstyr vi har (med tilstand, kvalitet, merknader) og utstyr vi mangler (med prisestimater) | Fanene **Oversikt** (det vi har) og **Mangler** (det vi mangler), med priser bevart |
| **Slagverkoppsett** | Google Presentasjon | Tre lysbilder med konkrete sceneoppsett (Eksempelkonsert, NM 2026, SummerBrass) | *Holdes foreløpig utenfor.* Se avsnitt 3.2 |

### 3.1 Problemene med dagens løsning

- **Spredt informasjon.** Tre formater (dokument, regneark, presentasjon) for
  det som logisk hører sammen. Man må åpne flere filer for å få oversikt.
- **Dobbeltføring.** Samme instrument beskrives både i oversikten og i
  regnearket, og de kan komme i utakt.
- **Ingen kobling mellom mangler og budsjett.** Prisene står i regnearket, men
  det finnes ikke et verktøy for å si «hvis vi har 100 000 kr, hva kan vi kjøpe?».
- **Tungvint på mobil.** Google-dokumenter og regneark er upraktiske å redigere
  fra en telefon på en øvelse eller i et instrumentlager.

### 3.2 Bevisste avgrensninger

- **Slagverkoppsett (sceneoppsett)** migreres *ikke* i denne omgangen. Det er en
  annen type informasjon (oppstilling per konsert, ikke inventar), og fortjener
  eventuelt en egen modul senere. Presentasjonen kan ligge i Drive inntil videre.
- **Kontaktinformasjon og generelle notater** fra oversiktsdokumentet tas inn
  som merknader der det er relevant, men appen er ikke et generelt notatverktøy.

### 3.3 Utfasing av de gamle dokumentene

De gamle Drive-dokumentene **slettes ikke**. De settes i skrivebeskyttet
tilstand / arkiveres når det er bekreftet at all informasjon er korrekt overført
og appen er i bruk. Dette gir en trygg tilbakefallsmulighet i en overgangsfase.

---

## 4. Teknisk utgangspunkt

Applikasjonen er allerede bygget og fungerer. Dagens oppbygning:

- **Frontend:** ren HTML/CSS/JavaScript uten byggesteg (PWA med service worker).
- **API:** Cloudflare **Pages Functions** – filbasert ruting under `functions/`.
- **Database:** Cloudflare **D1** (SQLite på nett).
- **Tilgang:** felles kode via `ACCESS_CODE`.
- **Eksport:** Excel (SheetJS) og CSV direkte i nettleseren.

Alle API-endepunkter er testet mot en ekte D1-migrering og fungerer.

### 4.1 Hvorfor migrere

Cloudflare har slått sammen Pages og Workers til én plattform og anbefaler nå
**Workers med static assets** for alle nye prosjekter. All ny funksjonalitet
slippes på Workers først, og Pages settes i praksis i vedlikeholdsmodus. Å
flytte nå – mens appen er liten – er langt billigere enn å gjøre det senere, og
gir tilgang til Workers-funksjoner (Cron Triggers, bedre observability,
Durable Objects, Secrets Store) hvis seksjonen får behov for dem.

Kostnadsbildet er uendret: statiske filer er gratis, og funksjonskall belastes
til samme Workers-pris som før. Reell kostnad forblir 0 kr/mnd ved normal bruk.

---

## 5. Migreringsplan: Pages → Workers

Målet er funksjonell paritet – appen skal oppføre seg nøyaktig som før, bare
distribuert som en Worker med static assets. Endringene er konfigurasjons- og
struktur­endringer, ikke ny logikk.

### Fase 0 – Forberedelse

- Ta vare på dagens fungerende Pages-versjon (egen git-branch eller tag) som
  tilbakefallspunkt.
- Bekrefte at GitHub-kontoen er koblet til Cloudflare via «Cloudflare Workers and
  Pages»-appen (allerede på plass).

### Fase 1 – Konfigurasjon (`wrangler.toml`)

- Endre fra Pages-modellen (`pages_build_output_dir`) til Workers-modellen med
  en `[assets]`-blokk som peker på `public/` og bruker
  `not_found_handling = "single-page-application"`.
- Beholde D1-bindingen `DB` uendret.
- Definere `main` som peker på Worker-entrypunktet (se Fase 2).
- Sette `compatibility_date`.

### Fase 2 – Flytte API fra Pages Functions til én Worker

Dette er kjernen i jobben. Pages bruker filbasert ruting (`functions/api/...`);
Workers bruker ett entrypunkt med egen ruting.

- Opprette ett Worker-entrypunkt (f.eks. `src/index.js`) med en `fetch`-handler.
- Legge inn en liten ruter som mapper:
  - `POST /api/login`
  - `GET/POST /api/inventory`
  - `PUT/DELETE /api/inventory/:id`
  - `GET/POST /api/wishlist`
  - `PUT/DELETE /api/wishlist/:id`
  - `POST /api/chat`
- Gjenbruke den eksisterende logikken fra `functions/`-filene nær uendret –
  samme SQL, samme hjelpefunksjoner (`checkAuth`, `json`, `err`, `newId`).
- La alle andre forespørsler falle gjennom til static assets (frontend), slik at
  PWA-en serveres som før.

### Fase 3 – Statisk innhold

- Beholde `public/` som assets-katalog (HTML, JS, CSS, manifest, ikoner, service
  worker) uten endringer.
- Legge til en `.assetsignore` om nødvendig, slik at Worker-koden ikke ved en
  feil lastes opp som en statisk fil.
- Bekrefte at service worker fortsatt lar `/api/`-kall gå rett til nett (den er
  allerede satt opp slik).

### Fase 4 – Lokal verifisering

- Kjøre `wrangler dev` (ny standardport **8787**, mot tidligere 8788).
- Bruke det samme testoppsettet som allerede er laget for å bekrefte at alle
  endepunkter svarer riktig (lese, opprette, oppdatere, slette, avvise feil
  tilgangskode, samt at AI-endepunktet gir vennlig melding uten nøkkel).
- Klikke gjennom appen i nettleser og i mobilvisning.

### Fase 5 – Distribusjon

To likeverdige veier, velg én:

- **Git-basert (anbefalt):** koble repoet i Cloudflare-dashbordet under
  **Workers & Pages → Create → Workers → Connect to Git (Workers Builds)**, slik
  at hver `git push` bygger og distribuerer automatisk.
- **Direkte:** `wrangler deploy` fra maskinen.

Etter første distribusjon:

- Kjøre D1-migreringen mot fjerndatabasen (`wrangler d1 migrations apply … --remote`).
- Bekrefte at D1-bindingen `DB` er koblet til Worker-prosjektet i dashbordet
  (**Settings → Bindings**).
- Sette `ACCESS_CODE` som secret.
- Konfigurere et `workers.dev`-subdomene (erstatter `pages.dev`-adressen).

### Fase 6 – Datainnlegging og kontroll

- Bekrefte at seed-dataene i migreringen samsvarer nøyaktig med dagens
  Utstyrsliste (inventar + mangler med priser).
- Korrigere eventuelle avvik direkte i appen.
- Få minst én annen person i seksjonen til å logge inn fra egen enhet og bekrefte
  at redigering virker og synkroniseres.

### Fase 7 – Overgang og opprydding

- Sette de tre gamle Drive-dokumentene i skrivebeskyttet / arkivert tilstand.
- Dele app-adressen og tilgangskoden med seksjonen.
- Oppdatere README slik at den matcher dagens Cloudflare-dashbord og
  Workers-flyten (dette var den opprinnelige feilen som utløste konverteringen).

---

## 6. Risiko og tiltak

| Risiko | Tiltak |
|---|---|
| Ruting i Worker oppfører seg ulikt Pages' filbaserte ruting | Verifisere hvert endepunkt med eksisterende testoppsett før distribusjon |
| D1-binding mangler etter distribusjon (vanligste feil) | Eksplisitt sjekkpunkt i Fase 5; redeploy etter at binding er satt |
| Tilgangskode lekker (felles kode er ikke per-bruker-sikkerhet) | Akseptert for v1; kan oppgraderes til ekte innlogging senere ved behov |
| AI-oppslag mot leverandørsider er skjørt (sider blokkerer henting) | Holdt utenfor v1; v2-tilnærming lar AI strukturere innlimt data fremfor å hente selv |
| Tap av historikk fra gamle dokumenter | Drive-dokumenter arkiveres, ikke slettes |

---

## 7. Hva som er gjort, og hva som gjenstår

**Gjort:** applikasjonen er bygget, all data fra Utstyrslisten er lagt inn,
API-et er testet, og frontend fungerer på mobil og PC.

**Gjenstår (denne planen):** konvertering fra Pages til Workers (Fase 1–5),
datakontroll (Fase 6), og overgang med oppdatert README (Fase 7).

**Beslutning som trengs fra deg:** godkjenne planen slik den står, eventuelt
med justeringer på avgrensningene i avsnitt 3.2 (særlig om Slagverkoppsett skal
inn nå eller senere).
