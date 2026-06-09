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

Felles kode for hele seksjonen (ikke per bruker). Lagres som secret `ACCESS_CODE`;
frontend sender den som `x-access-code`-header på **hvert** API-kall.

- **Alle endepunkter er låst.** Hver `/api/`-handler kaller `requireAuth` først, så
  ingen kan gjette/bruke et endepunkt uten gyldig kode. Feil/manglende kode → `401`.
- **Fail closed.** Er `ACCESS_CODE` ikke konfigurert, nektes alt – appen er aldri
  åpen. Koden *må* settes som secret i produksjon, ellers virker ingenting.
- **Vedvarende innlogging.** Koden huskes i `localStorage`, så man forblir innlogget
  på samme enhet til man logger ut – eller til koden endres (da gir API `401` og
  frontend logger automatisk ut).
- Validering i `checkAuth()` med konstant-tid-ish sammenligning.

Felles kode er ikke ekte per-bruker-innlogging; akseptert for formålet. (Mulig
framtidig herding: rate-limiting av innlogging for å bremse gjetting.)

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

**Full tilgang:** assistenten har verktøy for å opprette, oppdatere og slette alt
appen kan – inventar, mangler, alternativer, innkjøpslister og merker. Skjemaet
bruker `enum` for gyldige verdier, og oppdater/slett tar en `ref` som er **id
eller bare navnet/typen** («Majestic», «xylofonen») – `resolveRef` slår opp riktig
rad og ber om presisering hvis flere matcher (så modellen slipper å gjette id-er).

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

### Leverandør (Anthropic eller OpenAI-kompatibel)

`chat.js` har to stier, valgt med env:

| Env | Verdi |
|---|---|
| `AI_PROVIDER` | `anthropic` (standard) eller `openai` |
| `AI_API_KEY` | nøkkel/bearer-token (påkrevd) |
| `AI_MODEL` | modell-id, f.eks. `gemini-2.5-flash-lite` |
| `AI_BASE_URL` | **kun OpenAI-stien** – base-URL til et OpenAI-kompatibelt endepunkt |

OpenAI-stien er OpenAI-kompatibel og funker mot OpenAI, **Google Gemini**
(`https://generativelanguage.googleapis.com/v1beta/openai`), Cloudflare Workers AI,
Groq, DeepSeek m.fl. – bytt leverandør uten kodeendring.

**Oppsett Gemini 2.5 Flash-Lite** (billig, god norsk, moden function calling):
```
AI_PROVIDER = openai
AI_BASE_URL = https://generativelanguage.googleapis.com/v1beta/openai
AI_MODEL    = gemini-2.5-flash-lite
AI_API_KEY  = <Google AI Studio-nøkkel>
```

**Pris:** for dette volumet er kostnaden forsvinnende uansett (øre per handling med
Gemini Flash-Lite / GPT-nano; ~10× det med Haiku; ~0 kr på Workers AI innen
dagskvote). Velg etter pålitelighet på norsk tool calling, ikke pris.

**Gratisnivå-grense:** Gemini sitt gratisnivå for `gemini-2.5-flash-lite` er ca.
**20 forespørsler/dag** (per modell). Greit til sporadisk bruk, men slå på fakturering
(betalt nivå) for høyere grenser – kostnaden er fortsatt ~1 øre per handling.

**Forståelse/intensjon:** systempromten i `chat.js` gir modellen en datamodell-
forklaring, kategori-hint, dato og en regel om å spørre ved tvetydighet. Egne
få-skudd-eksempler kan legges i `FEWSHOT`-lista (tom som standard) for å lære den
typiske norske fraseringer → riktige verktøykall.

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
