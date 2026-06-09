# Konsepter

## Tilgang

Appen er beskyttet av **én felles kode** for hele seksjonen – ikke per-bruker.
Dette er bevisst: lav terskel, ingen brukeradministrasjon å vedlikeholde.

- Koden lagres som Worker-secret `ACCESS_CODE`.
- Frontend sender den som headeren `x-access-code` på hvert API-kall
  (`app.js → api()`), og husker den i `sessionStorage` mellom sider.
- Worker-en validerer med `checkAuth()` i `src/helpers.js` via en konstant-tid-ish
  sammenligning. Hvis `ACCESS_CODE` ikke er satt, er appen **åpen** – så koden
  *må* settes i produksjon.
- Feil/manglende kode gir `401`; frontend logger da automatisk ut.

**Sikkerhetsnivå:** Felles kode er ikke ekte innlogging. Akseptert for v1; kan
oppgraderes til per-bruker-pålogging senere ved behov.

## PWA og offline

- `manifest.webmanifest` gjør appen **installerbar** på telefon og PC.
- `sw.js` (service worker) cacher app-skallet (`/`, `index.html`, `app.js`,
  `styles.css`, `manifest`) for rask oppstart og offline-visning av skallet.
- **API-kall (`/api/*`) går alltid til nett – aldri cache.** Dette er viktig: data
  skal alltid være ferskt, slik at en endring på mobil er synlig på PC umiddelbart.
- Cache-versjon styres av `CACHE = "slagverk-v1"`; bump strengen for å tvinge ny
  henting av skallet etter endringer i frontend.

## Responsivt UI

Samme HTML, to visninger via CSS:

- **Desktop:** tabeller (`<table>`) for tett oversikt.
- **Mobil:** kort (`.cards`) som er lettere å trykke på.

UI-et er bygget uten rammeverk: `app.js` holder en `state`-modell og rendrer hele
`#root` på nytt ved endring (`render()`), med enkel event-wiring etterpå.

## Faner

| Fane | Funksjon |
|---|---|
| **Oversikt** | Inventar med statistikk øverst, filtrering på kategori/status |
| **Mangler** | Ønskeliste gruppert etter prioritet, med pris og lenke |
| **Innkjøp** | Budsjettfelt + avhuking av `budgeted`; viser om planen holder rammen, eksportknapper |
| **AI-chat** | v2-assistent (se under) |

## Eksport

Fra **Innkjøp**-fanen, alt i nettleseren (ingen server involvert):

- **Excel** via SheetJS (lastes fra CDN i `index.html`) – to ark: «Inventar» og
  «Mangler».
- **CSV** med UTF-8 BOM, så det åpnes rett i både Excel og Google Sheets.

## AI-assistent (v2)

Endepunktet `POST /api/chat` (`src/routes/chat.js`) og chat-fanen finnes allerede,
men er **av som standard**:

- Uten secret `AI_API_KEY` svarer endepunktet vennlig med `configured: false` og
  gjør ingen eksterne kall.
- Settes `AI_API_KEY` (Anthropic-nøkkel), får modellen (`claude-haiku-4-5`)
  gjeldende inventar + ønskeliste som kontekst og kan foreslå endringer som JSON,
  slik at appen kan bekrefte før lagring.

Holdt utenfor v1 bevisst. Kostnad ved bruk: brøkdeler av et øre per melding.
