# Mål og bakgrunn

## Det viktigste målet: lav friksjon

Appen skal gjøre det **veldig enkelt å legge til og endre** når man oppdager et
behov – på en øvelse, i lageret, eller når man ser at noe mangler. Selve
registreringen skal være rask (gjerne via AI-assistenten, som utfører endringen
selv), slik at appen ellers i hovedsak brukes til å **se gjennom og eksportere**.
Se [konsepter.md](konsepter.md#kjernefunksjon-raskt-å-endre-når-behovet-oppstår).

## Hovedmål

Gi slagverkseksjonen ett samlet, alltid oppdatert verktøy for å:

1. **Se hva vi har** – komplett inventar med tilstand (`status`) og kvalitet
   (`quality`) per instrument, filtrerbart på kategori og status.
2. **Se hva vi mangler** – ønskeliste over manglende utstyr og oppgraderinger,
   gruppert etter prioritet, med prisestimater og lenker til leverandør.
3. **Planlegge innkjøp** – legge inn et budsjett, huke av hva som skal kjøpes,
   og se umiddelbart om planen holder seg innenfor rammen.
4. **Dele og rapportere** – eksportere til Excel/CSV for budsjettmøter, søknader
   eller styrebehandling.

## Sekundærmål

- **Tilgjengelig fra flere steder.** Data ligger sentralt i D1, ikke på én PC.
  Flere i seksjonen kan se og redigere det samme.
- **Mobil og PC.** Installerbar PWA på telefon; responsivt UI (tabell på PC,
  kortvisning på mobil).
- **Lav terskel.** Én felles tilgangskode – ingen brukeradministrasjon.
- **Tilnærmet gratis drift.** Innenfor Cloudflares gratisnivå.

## Suksesskriterier

- All informasjon fra de gamle Drive-dokumentene finnes i appen og stemmer.
- Minst to personer kan logge inn og redigere fra hver sin enhet.
- En endring gjort på mobil er synlig på PC umiddelbart.
- Eksport gir et brukbart regneark til budsjettarbeid.
- De gamle dokumentene kan arkiveres uten tap av informasjon.

## Hva appen erstatter

Tre løse Google Drive-dokumenter i mappen *Korps → Randaberg slagverk*:

| Dagens dokument | Type | Erstattes av |
|---|---|---|
| **Slagverksoversikt** | Google Dokument | Fanen **Oversikt** – strukturert per instrument med status/kvalitet, filtrerbar |
| **Utstyrsliste** | Google Regneark | Fanene **Oversikt** (det vi har) og **Mangler** (det vi mangler), med priser bevart |
| **Slagverkoppsett** | Google Presentasjon | *Holdes utenfor.* Sceneoppsett er en annen type info (oppstilling per konsert, ikke inventar) |

**Bevisste avgrensninger:** Sceneoppsett migreres ikke nå. Generelle notater tas
inn som merknader der det er relevant, men appen er ikke et notatverktøy.

**Utfasing:** De gamle dokumentene slettes ikke – de settes skrivebeskyttet /
arkiveres når data er bekreftet korrekt overført, som trygg tilbakefallsmulighet.

## Planlagt for senere (v2)

- **AI-assistent** for å legge inn og finne data med naturlig språk. Grensesnitt
  og endepunkt (`/api/chat`) finnes allerede, men aktiveres først når secret
  `AI_API_KEY` settes. Se [konsepter.md](konsepter.md#ai-assistent-v2).
