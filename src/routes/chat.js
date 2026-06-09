import { json, err, requireAuth, preferredStores } from "../helpers.js";
import { searchStore, fetchProductPrice } from "../store.js";
import * as db from "../db.js";

// ── AI-assistent (tool use) ──
// Chatten kan legge til / endre data SELV via verktøykall, slik at appen i
// hovedsak brukes til å se gjennom og eksportere. Hver mutasjon returneres i
// `actions` slik at frontend kan tilby «Angre».
//
// To leverandør-stier, valgt med env:
//   AI_PROVIDER = "anthropic" (standard) | "openai"
//   - "openai" brukes også automatisk hvis AI_BASE_URL er satt.
//   - OpenAI-stien er OpenAI-KOMPATIBEL og funker mot OpenAI, Google Gemini
//     (v1beta/openai), Cloudflare Workers AI, Groq, DeepSeek m.fl.
// Felles:
//   AI_API_KEY  – nøkkel/bearer-token (påkrevd)
//   AI_MODEL    – modell-id (f.eks. "gemini-2.5-flash-lite")
//   AI_BASE_URL – kun OpenAI-stien, f.eks.
//                 "https://generativelanguage.googleapis.com/v1beta/openai"

const DEFAULT_MODEL = { anthropic: "claude-haiku-4-5-20251001", openai: "gpt-4.1-nano" };
const MAX_STEPS = 16; // verktøy-runder per melding (større jobber trenger mange runder)

const CAT = ["Trommer", "Melodisk", "Pauker", "Cymbaler", "Stativer", "Perkusjon", "Stikker og klubber"];
const BRANDCAT = ["Generelt", ...CAT];
const STAT = ["ok", "redusert", "ødelagt"];
const QUAL = ["bra", "greit", "dårlig", "ukjent"];
const PRIO = ["høy", "middels", "lav"];
const str = (d = "") => ({ type: "string", description: d });
const enm = (vals, d = "") => ({ type: "string", enum: vals, description: d });
const num = (d = "kroner") => ({ type: "number", description: d });
// Referanse til en eksisterende rad: id fra DATA, ELLER bare navn/type (appen slår opp).
const ref = (what) => str(`${what}: id fra DATA, eller bare navnet/typen – appen finner raden (og spør hvis flere matcher).`);

// Kanonisk verktøydefinisjon (Anthropic-form). Konverteres til OpenAI-form under.
// Modellen har FULL tilgang: opprette, oppdatere og slette alt appen kan.
const TOOLS = [
  // Inventar
  { name: "add_inventory", description: "Legg til et utstyr vi eier. Kan være en del av noe (komponent-tre): et trommesett kan ha trommer/cymbaler/pedal som deler, en tromme kan ha skinn. Eks: «legg til en tom 12\" som del av trommesettet».",
    input_schema: { type: "object", required: ["type", "category"], properties: {
      type: str("instrumentnavn, f.eks. «Skarptromme»"), category: enm(CAT), brand: str("produsent"),
      model: str("modell, f.eks. «Professional Generation II»"), size: str("størrelse, f.eks. «36\"»"),
      status: enm(STAT, "standard ok"), quality: enm(QUAL, "standard ukjent"), notes: str(),
      parent_ref: ref("komponenten dette er en del av (valgfritt – f.eks. trommesettet)") } } },
  { name: "update_inventory", description: "Endre et utstyr, f.eks. status/kvalitet, eller flytt det inn under en komponent. Eks: «xylofonen er ødelagt».",
    input_schema: { type: "object", required: ["ref"], properties: {
      ref: ref("utstyret"), type: str(), brand: str(), model: str(), size: str(), category: enm(CAT), status: enm(STAT), quality: enm(QUAL), notes: str(),
      parent_ref: ref("flytt inn under denne komponenten") } } },
  { name: "delete_inventory", description: "Slett et utstyr.",
    input_schema: { type: "object", required: ["ref"], properties: { ref: ref("utstyret") } } },

  // Mangler
  { name: "add_wishlist", description: "Registrer en mangel / ønsket innkjøp. Eks: «vi mangler en ny pauke til ca 70k».",
    input_schema: { type: "object", required: ["type", "category"], properties: {
      type: str(), category: enm(CAT), priority: enm(PRIO, "standard middels"), estimated_price: num(),
      link: str("leverandør-lenke"), notes: str(),
      replaces_ref: ref("utstyr i dårlig stand som denne erstatter (valgfritt)") } } },
  { name: "update_wishlist", description: "Endre en mangel.",
    input_schema: { type: "object", required: ["ref"], properties: {
      ref: ref("mangelen"), type: str(), category: enm(CAT), priority: enm(PRIO), estimated_price: num(),
      link: str(), notes: str(), replaces_ref: ref("utstyr denne erstatter") } } },
  { name: "delete_wishlist", description: "Slett en mangel.",
    input_schema: { type: "object", required: ["ref"], properties: { ref: ref("mangelen") } } },

  // Innkjøpslister
  { name: "create_list", description: "Opprett en innkjøpsliste. Eks: «lag liste for NM 2026 med budsjett 100000».",
    input_schema: { type: "object", required: ["name"], properties: { name: str(), budget: num(), notes: str() } } },
  { name: "update_list", description: "Endre en innkjøpsliste (navn/budsjett/notat).",
    input_schema: { type: "object", required: ["ref"], properties: { ref: ref("listen"), name: str("nytt navn"), budget: num(), notes: str() } } },
  { name: "delete_list", description: "Slett en innkjøpsliste.",
    input_schema: { type: "object", required: ["ref"], properties: { ref: ref("listen") } } },
  { name: "add_to_list", description: "Legg et KONKRET PRODUKT (et alternativ fra en mangel) i en innkjøpsliste. En liste kan KUN inneholde produkter, ikke mangler. Mangelen må derfor ha et alternativ (add_option) først.",
    input_schema: { type: "object", required: ["list_ref", "option_ref"], properties: {
      list_ref: ref("listen"), option_ref: ref("produktet/alternativet (produsent/modell)"), qty: num("antall, standard 1") } } },
  { name: "remove_from_list", description: "Fjern et produkt fra en innkjøpsliste.",
    input_schema: { type: "object", required: ["list_ref", "option_ref"], properties: {
      list_ref: ref("listen"), option_ref: ref("produktet/alternativet") } } },

  // Godkjente merker
  { name: "add_brand", description: "Legg til et godkjent/foretrukket merke. Eks: «Gretsch er foretrukket innen trommer».",
    input_schema: { type: "object", required: ["name"], properties: {
      name: str(), category: enm(BRANDCAT, "hva merket er foretrukket innen, standard Generelt"), notes: str() } } },
  { name: "update_brand", description: "Endre et merke (navn/kategori/notat). Eks: «Majestic er foretrukket innen trommer».",
    input_schema: { type: "object", required: ["ref"], properties: {
      ref: ref("merket"), name: str("nytt navn"), category: enm(BRANDCAT), notes: str() } } },
  { name: "delete_brand", description: "Slett et godkjent merke.",
    input_schema: { type: "object", required: ["ref"], properties: { ref: ref("merket") } } },

  // Alternativer (konkrete produkter under en mangel)
  { name: "add_option", description: "Legg et produkt-/prisalternativ til en mangel.",
    input_schema: { type: "object", required: ["wishlist_ref"], properties: {
      wishlist_ref: ref("mangelen"), brand: str("produsent"), model: str(), size: str(), info: str(), link: str(), price: num() } } },
  { name: "update_option", description: "Endre et alternativ.",
    input_schema: { type: "object", required: ["ref"], properties: {
      ref: ref("alternativet (produsent/modell)"), brand: str(), model: str(), size: str(), info: str(), link: str(), price: num() } } },
  { name: "delete_option", description: "Slett et alternativ.",
    input_schema: { type: "object", required: ["ref"], properties: { ref: ref("alternativet") } } },

  // Butikk-søk (les-verktøy – finner ekte produkter med URL)
  { name: "search_store", description: "Søk opp EKTE produkter i de foretrukne butikkene (gir produktnavn + URL). Bruk dette FØR du legger inn et alternativ, så du kan bruke den eksakte produkt-URL-en.",
    input_schema: { type: "object", required: ["query"], properties: { query: str("søkeord, f.eks. «black swamp tamburin»") } } },

  // Oppfyllelse (kjøpt)
  { name: "fulfill_wishlist", description: "Marker en mangel som KJØPT/anskaffet. Produktet blir nytt inventar, mangelen fjernes, og evt. erstattet utstyr merkes utgått. Eks: «vi kjøpte den nye vibrafonen».",
    input_schema: { type: "object", required: ["ref"], properties: {
      ref: ref("mangelen som er kjøpt"), option_ref: ref("hvilket alternativ/produkt som ble kjøpt (valgfritt)") } } },
  { name: "fulfill_list", description: "Marker en hel innkjøpsliste som kjøpt: alle mangler oppfylles til inventar, og lista arkiveres.",
    input_schema: { type: "object", required: ["ref"], properties: { ref: ref("innkjøpslisten") } } },
];

const OPENAI_TOOLS = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));

// Få-skudd-eksempler: lær modellen norske fraseringer → riktig handling.
// Fyll inn SELV. La stå tom = ingen eksempler injiseres. Form per element:
//   { user: "det brukeren skriver", action: "kort: hvilket verktøy med hvilke felt" }
// F.eks.: { user: "…", action: "update_inventory(id=…, status=ødelagt)" }
const FEWSHOT = [
  // { user: "", action: "" },
];

// ── Navn→id-oppslag (B8) ──
// Lar modellen referere til rader med navn/type i stedet for opake UUID-er.
async function listFor(env, kind) {
  switch (kind) {
    case "inventory": return db.listInventory(env);
    case "wishlist": return db.listWishlist(env);
    case "list": return db.listLists(env);
    case "brand": return db.listBrands(env);
    case "option": return (await db.listWishlist(env)).flatMap((w) => w.options || []);
  }
}
function labelFor(kind, it) {
  if (kind === "inventory") return [it.type, it.brand].filter(Boolean).join(" ");
  if (kind === "option") return [it.brand, it.model, it.size].filter(Boolean).join(" ");
  return it.name || it.type || it.id;
}
const KIND_LABEL = { inventory: "utstyr", wishlist: "mangel", list: "liste", brand: "merke", option: "alternativ" };
async function resolveRef(env, kind, value) {
  if (value === undefined || value === null || value === "") throw new Error(`Mangler referanse til ${KIND_LABEL[kind]}.`);
  const items = (await listFor(env, kind)) || [];
  const exact = items.find((it) => it.id === value);
  if (exact) return exact.id;
  const q = String(value).toLowerCase().trim();
  const m = items.filter((it) => labelFor(kind, it).toLowerCase().includes(q));
  if (m.length === 1) return m[0].id;
  if (m.length === 0) throw new Error(`Fant ingen ${KIND_LABEL[kind]} som matcher «${value}».`);
  throw new Error(`Flere ${KIND_LABEL[kind]} matcher «${value}»: ${m.map((x) => `${labelFor(kind, x)} (${x.id})`).join("; ")}. Be brukeren presisere, eller bruk id.`);
}

// Kjør ett verktøykall mot databasen. Returnerer { summary, action }.
async function runTool(env, name, input) {
  switch (name) {
    // ── Inventar ──
    case "add_inventory": {
      if (input.parent_ref) input.parent_id = await resolveRef(env, "inventory", input.parent_ref);
      const row = await db.createInventory(env, input);
      return { summary: `La til ${row.type}`, action: { kind: "inventory", op: "create", id: row.id, after: row } };
    }
    case "update_inventory": {
      const id = await resolveRef(env, "inventory", input.ref);
      if (input.parent_ref) input.parent_id = await resolveRef(env, "inventory", input.parent_ref);
      const r = await db.updateInventory(env, id, input);
      return { summary: `Oppdaterte ${r.after.type}`, action: { kind: "inventory", op: "update", id, before: r.before, after: r.after } };
    }
    case "delete_inventory": { const id = await resolveRef(env, "inventory", input.ref); const r = await db.deleteInventory(env, id);
      return { summary: `Slettet ${r.before.type}`, action: { kind: "inventory", op: "delete", id, before: r.before } }; }

    // ── Mangler ──
    case "add_wishlist": { if (input.replaces_ref) input.replaces_inventory_id = await resolveRef(env, "inventory", input.replaces_ref);
      const row = await db.createWishlist(env, input);
      return { summary: `La til mangel ${row.type}`, action: { kind: "wishlist", op: "create", id: row.id, after: row } }; }
    case "update_wishlist": { const id = await resolveRef(env, "wishlist", input.ref);
      if (input.replaces_ref) input.replaces_inventory_id = await resolveRef(env, "inventory", input.replaces_ref);
      const r = await db.updateWishlist(env, id, input);
      return { summary: `Oppdaterte mangel ${r.after.type}`, action: { kind: "wishlist", op: "update", id, before: r.before, after: r.after } }; }
    case "delete_wishlist": { const id = await resolveRef(env, "wishlist", input.ref); const r = await db.deleteWishlist(env, id);
      return { summary: `Slettet mangel ${r.before.type}`, action: { kind: "wishlist", op: "delete", id, before: r.before } }; }

    // ── Innkjøpslister ──
    case "create_list": { const row = await db.createList(env, input);
      return { summary: `Opprettet listen «${row.name}»`, action: { kind: "list", op: "create", id: row.id, after: row } }; }
    case "update_list": { const id = await resolveRef(env, "list", input.ref); const r = await db.updateList(env, id, input);
      return { summary: `Oppdaterte listen «${r.after.name}»`, action: { kind: "list", op: "update", id, before: r.before, after: r.after } }; }
    case "delete_list": { const id = await resolveRef(env, "list", input.ref); const r = await db.deleteList(env, id);
      return { summary: `Slettet listen «${r.before.name}»`, action: { kind: "list", op: "delete", id, before: r.before } }; }
    case "add_to_list": { const lid = await resolveRef(env, "list", input.list_ref); const oid = await resolveRef(env, "option", input.option_ref);
      await db.addToList(env, lid, oid, input.qty);
      return { summary: `La produkt i liste`, action: { kind: "list_item", op: "add", list_id: lid, option_id: oid } }; }
    case "remove_from_list": { const lid = await resolveRef(env, "list", input.list_ref); const oid = await resolveRef(env, "option", input.option_ref);
      await db.removeFromList(env, lid, oid);
      return { summary: `Fjernet produkt fra liste`, action: { kind: "list_item", op: "remove", list_id: lid, option_id: oid } }; }

    // ── Godkjente merker ──
    case "add_brand": { const row = await db.createBrand(env, input);
      return { summary: `La til merket ${row.name}`, action: { kind: "brand", op: "create", id: row.id, after: row } }; }
    case "update_brand": { const id = await resolveRef(env, "brand", input.ref); const r = await db.updateBrand(env, id, input);
      return { summary: `Oppdaterte merket ${r.after.name}`, action: { kind: "brand", op: "update", id, before: r.before, after: r.after } }; }
    case "delete_brand": { const id = await resolveRef(env, "brand", input.ref); const r = await db.deleteBrand(env, id);
      return { summary: `Slettet merket ${r.before.name}`, action: { kind: "brand", op: "delete", id, before: r.before } }; }

    // ── Butikk-søk (les) ──
    case "search_store": {
      const results = await searchStore(env, input.query);
      if (!results.length) return { summary: `Ingen treff for «${input.query}» i butikkene.` };
      return { summary: "Ekte produkter (navn :: pris :: url):\n" + results.map((r) => `- ${r.name}${r.price ? ` :: ${r.price} kr` : ""} :: ${r.url}`).join("\n") };
    }

    // ── Oppfyllelse (ingen angre – tilsiktet handling) ──
    case "fulfill_wishlist": {
      const wid = await resolveRef(env, "wishlist", input.ref);
      const optId = input.option_ref ? await resolveRef(env, "option", input.option_ref) : null;
      const r = await db.fulfillWishlist(env, wid, optId);
      return { summary: `Kjøpt: ${r.inventory.type} lagt i inventar${r.retired ? ", gammelt utstyr merket utgått" : ""}` };
    }
    case "fulfill_list": {
      const lid = await resolveRef(env, "list", input.ref);
      const r = await db.fulfillList(env, lid);
      return { summary: `Liste kjøpt: ${r.count} produkt(er) lagt i inventar, lista arkivert` };
    }

    // ── Alternativer ──
    case "add_option": {
      const wid = await resolveRef(env, "wishlist", input.wishlist_ref);
      // Valider lenken: hent produktsiden. Ugyldig lenke (404/feil host) fjernes
      // (modellen skal kun bruke URL-er fra search_store). Pris auto-hentes.
      let linkNote = "";
      if (input.link) {
        try {
          const pr = await fetchProductPrice(env, input.link);
          if (pr.error) { input.link = ""; linkNote = " (ugyldig lenke ble fjernet – bruk search_store)"; }
          else if (pr.price && (input.price === undefined || input.price === null)) input.price = pr.price;
        } catch { input.link = ""; linkNote = " (lenke kunne ikke verifiseres og ble fjernet)"; }
      }
      const row = await db.createOption(env, wid, input);
      return { summary: `La til alternativ ${[row.brand, row.model].filter(Boolean).join(" ")}${row.price ? ` (${row.price} kr)` : ""}${linkNote}`, action: { kind: "option", op: "create", id: row.id, after: row } };
    }
    case "update_option": { const id = await resolveRef(env, "option", input.ref); const r = await db.updateOption(env, id, input);
      return { summary: `Oppdaterte alternativ`, action: { kind: "option", op: "update", id, before: r.before, after: r.after } }; }
    case "delete_option": { const id = await resolveRef(env, "option", input.ref); const r = await db.deleteOption(env, id);
      return { summary: `Slettet alternativ`, action: { kind: "option", op: "delete", id, before: r.before } }; }

    default: throw new Error("Ukjent verktøy: " + name);
  }
}

// ── Anthropic-sti ──
async function anthropicLoop(env, system, userMessages) {
  const model = env.AI_MODEL || DEFAULT_MODEL.anthropic;
  const messages = userMessages.map((m) => ({ role: m.role, content: m.content }));
  const actions = [], texts = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": env.AI_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 2048, system, tools: TOOLS, messages }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    const content = data.content || [];
    for (const c of content) if (c.type === "text" && c.text.trim()) texts.push(c.text.trim());
    const toolUses = content.filter((c) => c.type === "tool_use");
    // Kjør verktøykall når de finnes – også hvis svaret ble avkuttet (max_tokens).
    if (!toolUses.length) break;
    messages.push({ role: "assistant", content });
    const results = [];
    for (const tu of toolUses) {
      try { const r = await runTool(env, tu.name, tu.input || {}); if (r.action) actions.push(r.action);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: r.summary }); }
      catch (e) { results.push({ type: "tool_result", tool_use_id: tu.id, content: "Feil: " + e.message, is_error: true }); }
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: texts.join("\n") || "Gjort.", actions };
}

// ── OpenAI-kompatibel sti (OpenAI, Gemini, Workers AI, Groq, DeepSeek …) ──
async function openaiLoop(env, system, userMessages) {
  const base = (env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = env.AI_MODEL || DEFAULT_MODEL.openai;
  const messages = [{ role: "system", content: system }, ...userMessages.map((m) => ({ role: m.role, content: m.content }))];
  const actions = [], texts = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.AI_API_KEY}` },
      body: JSON.stringify({ model, max_tokens: 2048, messages, tools: OPENAI_TOOLS, tool_choice: "auto" }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) break;
    if (msg.content && String(msg.content).trim()) texts.push(String(msg.content).trim());
    const calls = msg.tool_calls || [];
    if (!calls.length) break;
    messages.push(msg); // assistant-melding med tool_calls
    for (const tc of calls) {
      let result;
      try { const args = JSON.parse((tc.function && tc.function.arguments) || "{}");
        const r = await runTool(env, tc.function.name, args); if (r.action) actions.push(r.action); result = r.summary; }
      catch (e) { result = "Feil: " + e.message; }
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }
  return { reply: texts.join("\n") || "Gjort.", actions };
}

// POST /api/chat   { messages: [{role, content}] }
export async function chat(request, env) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;

  if (!env.AI_API_KEY) {
    return json({ reply: "AI-assistenten er ikke aktivert ennå. Sett en secret kalt AI_API_KEY i Cloudflare for å skru den på.", configured: false, actions: [] });
  }

  let b;
  try { b = await request.json(); } catch { return err("Ugyldig JSON"); }
  const userMessages = (b.messages || []).map((m) => ({ role: m.role, content: m.content }));

  const [inv, wish, lists, brands] = await Promise.all([db.listInventory(env), db.listWishlist(env), db.listLists(env), db.listBrands(env)]);
  const today = new Date().toISOString().slice(0, 10);
  const stores = preferredStores(env);
  const brandsByCat = {};
  for (const br of brands) (brandsByCat[br.category] ||= []).push(br.name);
  const brandHint = Object.entries(brandsByCat).map(([c, ns]) => `${c}: ${ns.join(", ")}`).join(" · ") || "(ingen registrert)";
  const examples = FEWSHOT.length
    ? "EKSEMPLER (melding → hva du bør gjøre)\n" + FEWSHOT.map((e) => `- «${e.user}» → ${e.action}`).join("\n") + "\n\n"
    : "";
  const system = `Du er assistenten til slagverkseksjonen i Randaberg Musikkorps. Svar kort og på norsk.

FORMAT: Skriv REN TEKST uten markdown. Ikke bruk **fet**, *kursiv*, #overskrifter,
kodeblokker eller punktlister med «*»/«-»/«1.» – appen viser teksten akkurat som
den er, så slike tegn vises bokstavelig. Trenger du å liste opp, skriv det på korte
linjer eller skill med komma.

NØYAKTIGHET: Bruk KUN dataene nederst. Ikke finn på utstyr, mangler, id-er, priser
eller koblinger – les av eksakt det som står. Inventar (det vi EIER) og mangler
(det vi ØNSKER/trenger) er to ULIKE lister: ikke bland dem og ikke tell dem sammen.
På «hvor mange X har vi» teller du KUN i Inventar. Oppgi tall og navn nøyaktig slik
de står; er du usikker, si det heller enn å gjette.
Dagens dato: ${today}.

OPPGAVE
Du holder orden på inventar, mangler, innkjøpslister og godkjente merker, og bruker
verktøyene til å utføre endringer direkte. Du har FULL tilgang: opprette, oppdatere
og slette inventar, mangler, alternativer, innkjøpslister og merker. Ikke be om
bekreftelse for klare forespørsler – gjør endringen og fortell kort hva du gjorde.
Når du oppdaterer/sletter/kobler kan du oppgi id fra DATA, eller bare navnet/typen
(f.eks. «Majestic», «xylofonen») – appen slår opp riktig rad og spør hvis flere matcher.

UTFØR, IKKE BARE FORTELL: Du MÅ faktisk kalle verktøyene. Ikke skriv «nå søker jeg
…» eller «nå legger jeg til …» uten å samtidig gjøre verktøykallet – tekst alene
endrer ingenting. Ved større jobber (flere mangler, søk + alternativer): jobb deg
gjennom til ALT er gjort – ett verktøykall om gangen er helt greit, og du kan bruke
mange runder. Ikke avslutt før alle delene er utført. Trenger du å søke opp et
produkt, kall search_store og bruk deretter add_option med den ekte URL-en.

BUTIKKER OG LENKER (vær nøye!)
Foretrukne butikker: ${stores.join(", ")}.
For å finne et konkret produkt skal du ALLTID bruke verktøyet search_store først –
aldri gjett. Oppgir ikke brukeren et merke, SØK med ett av de foretrukne merkene
for kategorien (se FORETRUKNE MERKER under) + produkttype, f.eks. «sabian suspended
cymbal». Prøv flere foretrukne merker hvis første søk ikke gir gode treff.
LENKER: bruk KUN en URL som search_store FAKTISK returnerte, kopiert ordrett som
link i add_option (da hentes pris automatisk). Du skal ALDRI konstruere, gjette,
endre eller hente en produkt-URL fra hukommelsen. Får du ingen relevante treff,
si det – ikke fest en lenke du ikke har fått fra search_store.

FORETRUKNE MERKER PER KATEGORI (bruk når brukeren ikke oppgir merke):
${brandHint}

DATAMODELL
- Inventar = utstyr vi eier (type, merke, kategori, status, kvalitet, merknader).
- Mangel = noe vi ønsker/trenger å kjøpe. En mangel kan ha flere ALTERNATIVER
  (konkrete produkter med pris). Skal mangelen erstatte et eksisterende utstyr i
  dårlig stand, sett replaces_inventory_id (da er det en «erstatning», ellers en
  vanlig «mangel»).
- Innkjøpsliste = navngitt samling KONKRETE PRODUKTER man skal kjøpe (egen sum/
  budsjett). En liste-linje er ALLTID et produkt (et alternativ fra en mangel) – ALDRI
  en bar mangel. For å legge noe i en liste: finn/lag et alternativ på mangelen
  (søk med search_store → add_option), og legg deretter DET produktet i lista med
  add_to_list (option_ref). Har mangelen flere alternativer, velg det beste.
- Godkjente merker = foretrukne leverandører, gruppert etter utstyrstype.

GYLDIGE VERDIER
kategori = Trommer|Melodisk|Pauker|Cymbaler|Stativer|Perkusjon|Stikker og klubber
status = ok|redusert|ødelagt · kvalitet = bra|greit|dårlig|ukjent · prioritet = høy|middels|lav

PLASSERING I KATEGORI (hint)
- Trommer: skarptromme, stortromme/grand casa, trommesett, bongos, congas
- Melodisk: xylofon, vibrafon, klokkespill, rørklokker, marimba
- Pauker: pauke, paukestol
- Cymbaler: suspended cymbal, tam tam, ride/crash/hi-hat
- Stativer: stikkebord, notestativ
- Perkusjon: tamburin, belltree, woodblock, triangel, shaker, cajon
- Stikker og klubber: trommestikker, pauke-klubber, marimbakøller, visper, mallets

TVETYDIGHET
Handle direkte når det er klart. Hvis flere ting matcher (f.eks. to like
«Suspended cymbal») eller du er usikker på hva brukeren mener, still ETT kort
oppfølgingsspørsmål før du endrer – ikke gjett.

${examples}DATA
Inventar: ${JSON.stringify(inv)}
Mangler (med alternativer): ${JSON.stringify(wish)}
Innkjøpslister: ${JSON.stringify(lists)}
Godkjente merker: ${JSON.stringify(brands)}`;

  const provider = (env.AI_PROVIDER || (env.AI_BASE_URL ? "openai" : "anthropic")).toLowerCase();
  try {
    const { reply, actions } = provider === "openai"
      ? await openaiLoop(env, system, userMessages)
      : await anthropicLoop(env, system, userMessages);
    return json({ reply, actions, configured: true });
  } catch (e) {
    return err("AI-tjenesten svarte med feil: " + e.message, 502);
  }
}
