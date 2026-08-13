# Design – palett, struktur og mørk modus

Alt visuelt styres av CSS-variabler øverst i [`public/styles.css`](../public/styles.css).
Endrer du en farge, gjør det **der** – ikke inline i `app.js`. Dette dokumentet er
fasiten på hvilke verdier som gjelder, og hva som må til for å legge til mørk modus.

Kilden er designdokumentet «Slagverk – Oversikt, alternativer» (Claude Design),
runde 2–4. Runde 2 finnes i både lys (`2a`) og mørk (`2b`) variant; runde 3 og 4
finnes kun i lys.

## Prinsipper

- **Papir er flaten, rødt er signalet.** Korpsrødt brukes til primærhandling, aktiv
  fane og «ødelagt» – aldri som stor flatefyll. Headeren er papirfarget.
- **Kun tilstand har farge.** Tilstand (ok/redusert/ødelagt) vises med venstre
  fargestripe på raden + en merkelapp. Kvalitet er en **nøytral** tre-trinns messing-
  måler med ordet under, nettopp for at de to aldri skal forveksles.
- **Messing = verdi.** Priser, summer og budsjett er messingfarget, ikke røde.
- **Prioritet arver tilstandsskalaen.** Høy = rød, middels = gul, lav = grå.

## Palett

Kolonnen «mørk» er **ikke implementert** – den er hentet fra `2b` i designdokumentet
og ligger her som fasit for den dagen mørk modus lages. Se avsnittet under.

### Flater og linjer

| Variabel | Rolle | Lys | Mørk (`2b`) |
|---|---|---|---|
| `--paper` | app-bakgrunn, header, bunnlinje | `#f6f1e7` | `#151310` |
| `--paper-2` | seksjonsoverskrift, chip-flate | `#efe7d6` | `#232019` |
| `--surface` | rader, kort, felt-flate | `#fffdf8` | `#1e1b16` |
| `--surface-2` | utvidet/underordnet rad | `#fdfaf2` | `#191712` |
| `--field` | input-bakgrunn | `#ffffff` | `#1e1b16` |
| `--line` | rammer, skiller | `#e4dac6` | `#2b2724` |
| `--line-2` | felt-kant, knappekant | `#ddd3bf` | `#332e28` |
| `--line-3` | ytre ramme | `#d9d2c4` | `#332e28` |
| `--rule` | rad-skille (svakest) | `#f0e8d8` | `#232019` |

### Blekk

| Variabel | Rolle | Lys | Mørk (`2b`) |
|---|---|---|---|
| `--ink` | brødtekst, titler | `#23201b` | `#f3eee4` |
| `--ink-2` | sterkeste tekst | `#1b1917` | `#f3eee4` |
| `--muted` | sekundærtekst, etiketter | `#6d6557` | `#c9c1b4` |
| `--faint` | hjelpetekst, plassholder | `#9c9484` | `#8d857a` |
| `--faint-2` | undertekst i rad | `#8a8172` | `#a49b8e` |
| `--label` | kolonnetitler (versaler) | `#a3977c` | `#8d857a` |

### Merke

| Variabel | Rolle | Lys | Mørk (`2b`) |
|---|---|---|---|
| `--red` | primærknapp, aktiv fane, ødelagt | `#ba2e26` | `#ba2e26` (uendret) |
| `--red-deep` | kant under `--red` | `#a02720` | `#a02720` |
| `--red-dark` | rød tekst på lys flate | `#8c1d17` | `#e2766c` |
| `--red-tint` | rød flate bak tekst/chip | `#f7e7e2` | `#33201d` |
| `--red-line` | kant på rød chip | `#eccbc6` | `#4a2b27` |
| `--brass` | messing-knapp | `#9a7b3f` | `#9a7b3f` |
| `--brass-d` | pris, sum, kvalitetsmåler | `#7d6230` | `#d9b878` |
| `--brass-t` | teller-chip («5 deler») | `#efe2c6` | `#332b1d` |
| `--brass-l` | tom del av kvalitetsmåler | `#e0d4b8` | `#3d362a` |

### Tilstand og prioritet

| Variabel | Rolle | Lys | Mørk (`2b`) |
|---|---|---|---|
| `--ok` | stripe/bar «ok» | `#3f7d55` | `#4e9268` |
| `--ok-t` / `--ok-l` / `--ok-ink` | merkelapp «OK» | `#e7f1ea` / `#c8e0d1` / `#2f6a44` | `#1c2a21` / `#2f4a38` / `#6cb185` |
| `--warn` | stripe/bar «redusert», middels | `#c08a1e` | `#d9a63c` |
| `--warn-t` / `--warn-l` / `--warn-ink` | merkelapp «Redusert» | `#f7eed8` / `#e6d3a4` / `#8a6413` | `#2c2415` / `#4a3d21` / `#e0b154` |
| `--bad` | «ødelagt» | `#ba2e26` | `#d9483e` |
| `--lav` | prioritet «lav» (nøytral) | `#bdb29a` | `#57503f` |

> Mørke verdier merket `2b` er direkte fra designet. De øvrige mørke verdiene er
> **utledet** langs samme skala – de er ikke tegnet, og bør sjekkes mot en skjerm
> før de festes.

## Typografi

| Rolle | Font | Bruk |
|---|---|---|
| Display | **Fraunces** 600 | app-tittel, ark-titler, listenavn, merkenavn, summer |
| UI | **Hanken Grotesk** 400–800 | alt annet |
| Tall | `font-variant-numeric: tabular-nums` | alle priser og summer |
| Størrelse | `ui-monospace` | mål som «14″» i produktrader |

## Struktur pr. skjerm

```
header (papir, 32px logo, tittel/undertittel pr. fane, dokument- + logg ut-knapp)
  oppsummeringsstripe (stort tall, segmentert bar, klikkbar legende)
  søkefelt + Filtre + «+»          ← klebrig kolonneoverskrift følger under
  seksjon (klebrig) → rader
  …
AI-bar        ┐ begge fast i bunn; chat-panelet dekker begge når det åpnes
fanelinje     ┘
```

Skjemaer er **ark fra bunnen** (`.sheet`), ikke bokser midt på skjermen: draghåndtak,
innhold i bolker (`.fset`), og klebrig fot der Slett ligger til venstre, Avbryt/Lagre
til høyre. Nedtrekk med få faste verdier (tilstand, kvalitet, prioritet) er byttet mot
segmenterte valg (`.seg`) i samme farger som listene bruker.

### Desktop (≥1024px) – designrunde 5 («Lagerhylle på stor skjerm»)

Samme DOM, CSS bytter layout (`@media (min-width: 1024px)` nederst i `styles.css`):

- **Sidekolonne 236px** (`.side`, renderes alltid, skjult på mobil): logo/tittel,
  fanene med antall (`.sitem`), filtrene som avkrysningsrader (`.sfilter`, kun
  Oversikt-fanen – ingen filterark), og nederst Generér oversikt / Eksporter / Logg ut.
- **Rader blir tabellkolonner**: `.row.deskcols` viser desktop-cellene (`.dcell`)
  Merke og modell · Merknad · Endret (Oversikt) og Kategori · Alternativer (Mangler);
  mobil-underteksten (`.sub`) skjules. Kolonnetitlene ligger i seksjonslinja (`.sec.cols`).
- **Skjemaer blir panel fra høyre** (samme `.sheet`, restylet: full høyde, 400px).
- Fanelinja i bunnen forsvinner (fanene bor i sida); AI-baren starter etter sidekolonnen.

## Mørk modus – ikke implementert

Status: **ikke laget.** Kun `2a`/`2b` (Oversikt) finnes i begge varianter; Mangler,
Innkjøp og Merker er kun tegnet lyst. Designdokumentet sier selv at mørk modus for
de øvrige «kommer om retningen sitter».

Slik gjøres det når den tid kommer:

1. **Én `@media (prefers-color-scheme: dark)`-blokk** som overstyrer `:root` med
   mørk-kolonnen over. Ingen andre selektorer bør trenge endring – hele arket er
   variabeldrevet. Automatisk etter systemvalg, ikke en bryter: designet har ingen
   innstillingsflate å plassere en bryter i.
2. **Logoen må bytte variant.** `logo(size, variant)` kalles i dag med `"red"` fire
   steder i `app.js`; i mørk modus skal `"white"` brukes
   (`public/randaberg-logo-white.png`, som allerede ligger der). Enten via
   `matchMedia("(prefers-color-scheme: dark)")` i `logo()`, eller ved å rendre begge
   og la CSS skjule den ene – sistnevnte unngår re-render ved temabytte.
3. **`theme-color`** i [`public/index.html`](../public/index.html) må settes pr. modus
   med to `<meta>`-tagger og `media`-attributt (`#f6f1e7` lys, `#151310` mørk).
4. **Fallback-SVG-en** i `fallbackSVG(stroke)` tar allerede en strekfarge – send hvit
   i mørk modus.
5. **Utskrift og rapport skal forbli lyse.** `@media print` og `.report` må ikke arve
   mørke variabler; rapporten er et dokument til andre korps, ikke en skjermflate.
6. **Verdiene for Mangler/Innkjøp/Merker må sjekkes visuelt** – de er utledet, ikke
   tegnet. Særlig messing på mørk flate (`--brass-d` = `#d9b878`) og de tre
   merkelapp-triplettene.
