# Datamodell og API

## Database (Cloudflare D1 / SQLite)

Fire tabeller. Skjema og seed ligger i `migrations/` (`0001_init.sql` =
inventar + mangler; `0002_lists_and_links.sql` = lister + koblinger). Tekst-ID-er
genereres i Worker-en med `newId(prefix)` når klienten ikke sender egen `id`.

### `inventory` – utstyr vi har

| Kolonne | Type | Standard | Merknad |
|---|---|---|---|
| `id` | TEXT | – | primærnøkkel, f.eks. `SD-1` / `INV-<rand>` |
| `type` | TEXT | – | **påkrevd** |
| `brand` | TEXT | `''` | merke |
| `model` | TEXT | `''` | modell (vises i generert oversikt) |
| `size` | TEXT | `''` | størrelse, f.eks. `36"` |
| `category` | TEXT | – | **påkrevd** (se kategoriliste) |
| `status` | TEXT | `ok` | `ok` \| `redusert` \| `ødelagt` |
| `quality` | TEXT | `ukjent` | `bra` \| `greit` \| `dårlig` \| `ukjent` |
| `notes` | TEXT | `''` | fritekst |
| `updated_at` | TEXT | `datetime('now')` | |

### `wishlist` – mangler / ønsker

| Kolonne | Type | Standard | Merknad |
|---|---|---|---|
| `id` | TEXT | – | `W-1` / `W-<rand>` |
| `type`, `category` | TEXT | – | **påkrevde** |
| `priority` | TEXT | `middels` | `høy` \| `middels` \| `lav` |
| `estimated_price` | INTEGER | `NULL` | kroner |
| `link` | TEXT | `''` | leverandørlenke (brukes av prisinnhenting) |
| `notes` | TEXT | `''` | |
| `budgeted` | INTEGER | `0` | eldre flagg (lister erstatter dette i praksis) |
| `replaces_inventory_id` | TEXT | `NULL` | **kobling →** `inventory.id` denne mangelen erstatter |
| `updated_at` | TEXT | `datetime('now')` | |

### `lists` – innkjøpslister

| Kolonne | Type | Standard | Merknad |
|---|---|---|---|
| `id` | TEXT | – | `L-1` / `L-<rand>` |
| `name` | TEXT | – | **påkrevd** |
| `sort_order` | INTEGER | `0` | rekkefølge |
| `budget` | INTEGER | `NULL` | valgfritt budsjett per liste |
| `notes` | TEXT | `''` | |

### `list_items` – innhold i listene (mange-til-mange)

| Kolonne | Type | Merknad |
|---|---|---|
| `list_id` | TEXT | **→** `lists.id` |
| `wishlist_id` | TEXT | **→** `wishlist.id` |
| `qty` | INTEGER | antall (standard 1) |

En mangel kan ligge i flere lister. `list_items.option_id` (valgfri) lar en
liste-linje peke på et konkret produktalternativ. Per-liste-sum og overordnet sum
regnes ut i frontend.

### `wishlist_options` – produkt-/prisalternativer per mangel

| Kolonne | Type | Merknad |
|---|---|---|
| `id` | TEXT | `OPT-<uuid>` |
| `wishlist_id` | TEXT | **→** `wishlist.id` |
| `brand`, `model`, `size`, `info`, `link` | TEXT | produsent, modell, størrelse, info, produktlenke |
| `price` | INTEGER | kroner |

En mangel kan ha flere alternativer; «Est. pris» i UI vises som **spenn** (laveste–
høyeste). `effPrice` (laveste alternativ, ellers `estimated_price`) brukes i summer.

### `brands` – godkjente/foretrukne merker

| Kolonne | Type | Standard | Merknad |
|---|---|---|---|
| `id` | TEXT | – | `BR-<uuid>` |
| `name` | TEXT | – | **påkrevd** |
| `category` | TEXT | `Generelt` | hva merket er foretrukket innen (gruppering) |
| `notes` | TEXT | `''` | |
| `sort_order` | INTEGER | `0` | |

**Koblinger oppsummert:** `list_items` binder innkjøpsliste ↔ mangel;
`wishlist.replaces_inventory_id` binder mangel ↔ utstyr-den-erstatter. Referansene
ryddes i app-logikken (slette utstyr nullstiller pekere; slette liste/mangel
fjerner rader i `list_items`).

**Kategorier:** Trommer, Melodisk, Pauker, Cymbaler, Stativer, Perkusjon.

## API

Alt under `/api/`, JSON inn/ut, krever `x-access-code`-header.

| Metode | Sti | Handling |
|---|---|---|
| `POST` | `/api/login` | Validér tilgangskode |
| `GET/POST` | `/api/inventory` | List / opprett utstyr |
| `PUT/DELETE` | `/api/inventory/:id` | Oppdater / slett |
| `GET/POST` | `/api/wishlist` | List / opprett mangel (m/ `replaces_inventory_id`) |
| `PUT/DELETE` | `/api/wishlist/:id` | Oppdater / slett |
| `GET/POST` | `/api/lists` | List (m/ `items`) / opprett liste |
| `PUT/DELETE` | `/api/lists/:id` | Oppdater / slett liste |
| `POST` | `/api/lists/:id/items` | Legg mangel i liste `{wishlist_id, qty?, option_id?}` |
| `DELETE` | `/api/lists/:id/items/:wishlistId` | Fjern mangel fra liste |
| `POST` | `/api/wishlist/:id/options` | Nytt alternativ for en mangel |
| `PUT/DELETE` | `/api/options/:id` | Oppdater / slett alternativ |
| `GET/POST` | `/api/brands` | List / opprett godkjent merke |
| `PUT/DELETE` | `/api/brands/:id` | Oppdater / slett merke |
| `GET` | `/api/search?q=&limit=&start=` | Søk ekte produkter (Hello Retail, paginert) → `{results:[{name,url,price}]}` |
| `POST` | `/api/price` | Hent pris fra leverandørlenke `{url}` → `{price, candidates}` |
| `POST` | `/api/chat` | AI-assistent med tool use → `{reply, actions, configured}` |

All skrivelogikk er samlet i `src/db.js`, delt mellom REST-rutene og
AI-verktøyene. Feilkoder: `400` (validering), `401` (tilgang), `404` (ukjent
id/sti), `405` (feil metode), `502` (leverandør/AI svarte feil). Feilsvar:
`{ "error": "<melding>" }`.

### Eksempler

```bash
# Mangel som erstatter et eksisterende utstyr
curl -X POST .../api/wishlist -H "x-access-code: …" -H "Content-Type: application/json" \
  -d '{"type":"Vibrafon (ny)","category":"Melodisk","replaces_inventory_id":"VB-1"}'

# Hent pris fra musikk-miljø
curl -X POST .../api/price -H "x-access-code: …" -H "Content-Type: application/json" \
  -d '{"url":"https://www.musikk-miljo.no/…"}'
```
