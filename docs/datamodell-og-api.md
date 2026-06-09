# Datamodell og API

## Database (Cloudflare D1 / SQLite)

To tabeller. Skjema og seed-data ligger i `migrations/0001_init.sql`. Tekst-ID-er
genereres i Worker-en med `newId(prefix)` når klienten ikke sender egen `id`.

### `inventory` – utstyr vi har

| Kolonne | Type | Standard | Merknad |
|---|---|---|---|
| `id` | TEXT | – | primærnøkkel, f.eks. `SD-1` eller `INV-<rand>` |
| `type` | TEXT | – | **påkrevd**, f.eks. «Skarptromme» |
| `brand` | TEXT | `''` | merke |
| `category` | TEXT | – | **påkrevd**, se kategoriliste under |
| `status` | TEXT | `ok` | `ok` \| `redusert` \| `ødelagt` |
| `quality` | TEXT | `ukjent` | `bra` \| `greit` \| `dårlig` \| `ukjent` |
| `notes` | TEXT | `''` | fritekst |
| `updated_at` | TEXT | `datetime('now')` | settes ved oppdatering |

### `wishlist` – det vi mangler / ønsker

| Kolonne | Type | Standard | Merknad |
|---|---|---|---|
| `id` | TEXT | – | primærnøkkel, f.eks. `W-1` eller `W-<rand>` |
| `type` | TEXT | – | **påkrevd** |
| `category` | TEXT | – | **påkrevd** |
| `priority` | TEXT | `middels` | `høy` \| `middels` \| `lav` |
| `estimated_price` | INTEGER | `NULL` | kroner |
| `link` | TEXT | `''` | leverandørlenke |
| `notes` | TEXT | `''` | fritekst |
| `budgeted` | INTEGER | `0` | `0` \| `1` – med i innkjøpsplanen |
| `updated_at` | TEXT | `datetime('now')` | settes ved oppdatering |

**Kategorier (frontend):** Trommer, Melodisk, Pauker, Cymbaler, Stativer, Perkusjon.

## API

Alle endepunkter ligger under `/api/`. JSON inn og ut. Alle krever gyldig
tilgangskode i headeren `x-access-code` (se [konsepter.md](konsepter.md#tilgang)).

| Metode | Sti | Handling | Suksess |
|---|---|---|---|
| `POST` | `/api/login` | Validér tilgangskode | `200 {ok:true}` |
| `GET` | `/api/inventory` | List alt utstyr (sortert kategori, type) | `200 [ … ]` |
| `POST` | `/api/inventory` | Opprett utstyr | `201 {row}` |
| `PUT` | `/api/inventory/:id` | Oppdater felter | `200 {row}` |
| `DELETE` | `/api/inventory/:id` | Slett | `200 {ok:true}` |
| `GET` | `/api/wishlist` | List ønskeliste | `200 [ … ]` |
| `POST` | `/api/wishlist` | Opprett ønske | `201 {row}` |
| `PUT` | `/api/wishlist/:id` | Oppdater felter | `200 {row}` |
| `DELETE` | `/api/wishlist/:id` | Slett | `200 {ok:true}` |
| `POST` | `/api/chat` | AI-assistent (v2) | `200 {reply, configured}` |

`PUT` oppdaterer kun feltene som sendes med (delvis oppdatering), og setter
`updated_at` automatisk. `POST` krever minst `type` og `category`.

### Feilkoder

| Kode | Når |
|---|---|
| `400` | Ugyldig JSON, manglende påkrevde felter, ingen felter å oppdatere |
| `401` | Feil eller manglende tilgangskode |
| `404` | Ukjent `/api/`-sti, eller `:id` finnes ikke |
| `405` | Kjent sti, men feil HTTP-metode |
| `502` | AI-tjenesten svarte med feil (kun `/api/chat`) |

Feilsvar har formen `{ "error": "<melding>" }`.

### Eksempel

```bash
# Liste utstyr
curl http://127.0.0.1:8787/api/inventory -H "x-access-code: test"

# Opprette utstyr
curl -X POST http://127.0.0.1:8787/api/inventory \
  -H "x-access-code: test" -H "Content-Type: application/json" \
  -d '{"type":"Triangel","category":"Perkusjon"}'
```
