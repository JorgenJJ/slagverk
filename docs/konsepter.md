# Konsepter

## Kjernefunksjon: raskt å endre når behovet oppstår

Den viktigste egenskapen til appen er at det skal være **veldig lavt friksjon å
legge til eller endre** når man oppdager noe – på en øvelse, i instrumentlageret,
eller når man ser at noe mangler. Appen skal i hovedsak brukes til å **se gjennom
og eksportere**; selve registreringen skal være rask.

To veier til samme mål:

1. **Direkte i UI:** «+ Legg til», trykk på en rad for å redigere, huk av i en
   liste. Fungerer alltid, også uten AI.
2. **Via AI-assistenten (anbefalt på mobil):** skriv naturlig språk i den dockede
   chatten – «xylofonen er ødelagt», «legg til en Sabian-cymbal i god stand»,
   «lag innkjøpsliste for NM med paukene» – så **utfører assistenten endringen
   selv**. Se [AI-assistenten](#ai-assistenten) under.

## Tilgang

Felles kode for hele seksjonen (ikke per bruker). Lagres som secret
`ACCESS_CODE`; frontend sender den som `x-access-code` og husker den i
`sessionStorage`. Validering i `checkAuth()` (konstant-tid-ish). Settes ikke
koden, er appen **åpen** – så den *må* settes i produksjon. Felles kode er ikke
ekte innlogging; akseptert for v1.

## Koblinger mellom ting

Utstyr, mangler og innkjøp henger sammen, og appen gjør koblingene synlige:

- **Mangel ↔ innkjøpsliste:** en mangel kan ligge i én eller flere
  innkjøpslister (`list_items`). Mangler-fanen viser hvilke lister en vare er i;
  liste-kortet viser varene med pris og sum.
- **Mangel ↔ utstyr den erstatter:** en mangel kan peke på et eksisterende
  utstyr i dårlig stand (`replaces_inventory_id`). Oversikten viser «↪ erstatning
  planlagt» på det slitte utstyret; Mangler viser «⟳ Erstatter …». Klikk hopper
  mellom fanene.

## Innkjøpslister

Flere navngitte lister samtidig (f.eks. «Prioritert 2026», «NM 2026»), hver med:

- **egen sum** og valgfritt **budsjett** med over/under-indikator,
- egne varer (mangler lagt til via avhuking),
- egen **eksport** (CSV per liste).

I tillegg vises en **overordnet sum** for alle mangler. Summene regnes ut i
frontend fra prisene i `wishlist`, så de holder seg konsistente.

## Generér oversikt

Lager en ferdig, utskriftsvennlig oversikt (samme form som det gamle
Drive-dokumentet): tittel, dato, og utstyr gruppert per kategori i to kolonner.
Ved generering kan man filtrere på **minste status** og **minste kvalitet** for å
vurdere hva som skal med (f.eks. «kun OK / minst greit»). Oversikten kan
**kopieres**, **skrives ut** (egen print-CSS skjuler app-skallet) eller lastes
ned som tekst.

## Prisinnhenting fra leverandør

Hver mangel kan ha en leverandørlenke. Knappen **«Hent pris»** (per vare eller
for alle) sender lenken til `/api/price`; Worker-en henter produktsiden
**server-side** (ingen CORS-sperre) og trekker ut prisen fra HTML-en.

Erfaring fra musikk-miljø.no:

- **Produktsider:** prisen ligger i statisk HTML (`32 880 kr`) og er lesbar.
  Pris-blokken viser ordinær + salgspris; appen velger den **laveste** (det man
  faktisk betaler).
- **Kategorisider** (`/slagverk`): JavaScript-rendret, ingen pris i rå-HTML –
  masseimport av hele katalogen er ikke mulig med enkel fetch. Derfor: pris per
  vare via lenke, ikke katalog-skraping.

Endepunktet er låst til godkjente domener (`ALLOWED_HOSTS`) for å hindre at det
misbrukes som åpen proxy.

## AI-assistenten

Endepunktet `POST /api/chat` bruker **Haiku med tool use** (function calling).
Modellen får gjeldende inventar, mangler og lister som kontekst, og et sett
**verktøy** (`add_inventory`, `update_inventory`, `add_wishlist`, `create_list`,
`add_to_list`, …). Flyten i Worker-en:

1. Kall Haiku med melding + verktøydefinisjoner.
2. Får modellen `tool_use`, kjører Worker-en tilsvarende `db.js`-operasjon og
   sender `tool_result` tilbake.
3. Loop til modellen er ferdig; returnér kort svar + liste over `actions`.

**Autonomi:** assistenten utfører endringer **direkte** (ikke «foreslå-så-bekreft»),
slik at det går raskt på mobil. Hver endring registreres i `actions`, og frontend
viser en **«Angre»**-knapp som reverserer dem via de vanlige CRUD-endepunktene.

Aktiveres ved å sette secret `AI_API_KEY` (Anthropic-nøkkel). Uten nøkkel svarer
endepunktet vennlig med `configured: false` og gjør ingen kall.

### Valg av modell

Modellen settes med env/secret **`AI_MODEL`** (fallback i `chat.js`), så den kan
byttes uten kodeendring.

| Modell | Når | Pris (per 1M tokens, 2026) |
|---|---|---|
| **Haiku 4.5** *(standard)* | Brukervendt chat, lav latens, enkle verktøykall | ~$1 inn / $5 ut |
| Sonnet 4.6 | Hvis Haiku bommer på flertrinns/uklare forespørsler | ~$3 inn / $15 ut (3× dyrere) |

**Anbefaling:** behold **Haiku 4.5** som standard. Oppgavene her er enkle,
strukturerte verktøykall på norsk der fart og lav kostnad teller mest – Haiku er
4–5× raskere og 3× billigere enn Sonnet, og håndterer tool use godt. Bytt til
Sonnet via `AI_MODEL` kun hvis assistenten viser seg upålitelig på mer sammensatte
forespørsler. (Andre leverandører som OpenAI/Gemini ville krevd en annen
integrasjon i `chat.js`; ikke verdt det for dette behovet nå.) Kostnad ved normal
bruk: brøkdeler av et øre per melding.

## Godkjente merker

Egen fane **Merker**: et enkelt register over foretrukne leverandører, gruppert
etter hvilket utstyr de er foretrukket innen (vi ønsker kun kvalitetsprodukter).
Brukes også som forslag (datalist) når man fyller inn merke på utstyr/alternativer.

## Alternativer per mangel

En mangel kan ha flere **produktalternativer** (`wishlist_options`): produsent,
modell, størrelse, info, produktlenke og pris. I Mangler-fanen vises «Est. pris»
som et **spenn** (laveste–høyeste), og raden kan **ekspanderes** for å se hvert
alternativ. Derfra kan et alternativ legges rett i en innkjøpsliste. En kolonne
viser om raden er en **Mangel** eller en **Erstatning** (utledet av
`replaces_inventory_id`).

## Filtre og gruppering (Oversikt)

Filtrene er delt per egenskap – **Kategori, Status, Kvalitet, Merke** – som
multi-select. På PC vises de som nedtrekk på linje (knyttet til kolonnene); på
mobil samles de i et eget «Filtre»-ark. Identiske rader (f.eks. to like
stikkebord) **slås sammen** til én rad med antall (`×N`) som kan ekspanderes.

## Docket chat + tastatur på mobil

Chatten er **alltid tilgjengelig** som en tynn bar nederst på skjermen (ikke en
egen fane). Den dekker aldri faktisk innhold: `body` har bunnpolstring lik
bar-høyden.

- **Åpne:** baren utvides til et panel over en dimmet bakgrunn (scrim).
- **Tastatur:** når chatten er åpen og man skriver, brukes `visualViewport` til å
  løfte panelet slik at inputfeltet ligger over tastaturet (`applyDockViewport`).
- **Skriver man et annet sted** (f.eks. i et redigeringsfelt) mens chatten er
  lukket, skjules den dockede baren (`hide-bar`) så den ikke flyter over innholdet
  over tastaturet.

## PWA og offline

Installerbar (`manifest.webmanifest`). Service worker (`sw.js`) cacher app-skallet
for rask/offline oppstart; **`/api/`-kall går alltid til nett**, aldri cache, så
data er ferskt. Cache-versjon: `slagverk-v2` – bump strengen ved endringer i
frontend for å tvinge ny henting.

## Eksport

I nettleseren, uten server: **Excel** (SheetJS – Inventar + Mangler), **CSV per
innkjøpsliste**, og **tekst** fra oversikt-generatoren. CSV har UTF-8 BOM så det
åpnes rett i Excel og Google Sheets.
