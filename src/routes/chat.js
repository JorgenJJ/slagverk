import { json, err, requireAuth } from "../helpers.js";
import * as db from "../db.js";

// ── AI-assistent (Haiku med tool use) ──
// Chatten kan legge til / endre data SELV via verktøykall, slik at appen i
// hovedsak brukes til å se gjennom og eksportere. Hver mutasjon returneres i
// `actions` slik at frontend kan tilby «Angre».
// Aktiveres ved å sette secret AI_API_KEY (Anthropic-nøkkel).

// Standardmodell. Kan overstyres uten kodeendring med env/secret AI_MODEL
// (f.eks. en Sonnet-id for høyere presisjon på bekostning av pris/fart).
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_STEPS = 6; // verktøy-runder per melding

const str = (d = "") => ({ type: "string", description: d });
const TOOLS = [
  { name: "add_inventory", description: "Legg til et nytt utstyr vi har.",
    input_schema: { type: "object", required: ["type", "category"], properties: {
      type: str("f.eks. Skarptromme"), category: str("Trommer|Melodisk|Pauker|Cymbaler|Stativer|Perkusjon"),
      brand: str(), status: str("ok|redusert|ødelagt"), quality: str("bra|greit|dårlig|ukjent"), notes: str() } } },
  { name: "update_inventory", description: "Oppdater et eksisterende utstyr (bruk id).",
    input_schema: { type: "object", required: ["id"], properties: {
      id: str(), type: str(), brand: str(), category: str(), status: str(), quality: str(), notes: str() } } },
  { name: "delete_inventory", description: "Slett et utstyr (bruk id).",
    input_schema: { type: "object", required: ["id"], properties: { id: str() } } },

  { name: "add_wishlist", description: "Legg til en mangel / ønsket innkjøp.",
    input_schema: { type: "object", required: ["type", "category"], properties: {
      type: str(), category: str(), priority: str("høy|middels|lav"),
      estimated_price: { type: "number", description: "kroner" }, link: str("leverandør-lenke"),
      notes: str(), replaces_inventory_id: str("id på utstyr denne erstatter, hvis relevant") } } },
  { name: "update_wishlist", description: "Oppdater en mangel (bruk id).",
    input_schema: { type: "object", required: ["id"], properties: {
      id: str(), type: str(), category: str(), priority: str(),
      estimated_price: { type: "number" }, link: str(), notes: str(),
      replaces_inventory_id: str() } } },
  { name: "delete_wishlist", description: "Slett en mangel (bruk id).",
    input_schema: { type: "object", required: ["id"], properties: { id: str() } } },

  { name: "create_list", description: "Opprett en ny innkjøpsliste.",
    input_schema: { type: "object", required: ["name"], properties: {
      name: str(), budget: { type: "number" }, notes: str() } } },
  { name: "add_to_list", description: "Legg en mangel til en innkjøpsliste.",
    input_schema: { type: "object", required: ["list_id", "wishlist_id"], properties: {
      list_id: str(), wishlist_id: str(), qty: { type: "number" } } } },
  { name: "remove_from_list", description: "Fjern en mangel fra en innkjøpsliste.",
    input_schema: { type: "object", required: ["list_id", "wishlist_id"], properties: {
      list_id: str(), wishlist_id: str() } } },

  { name: "add_brand", description: "Legg til et godkjent/foretrukket merke.",
    input_schema: { type: "object", required: ["name"], properties: {
      name: str(), category: str("hvilket utstyr merket er foretrukket innen"), notes: str() } } },
  { name: "add_option", description: "Legg til et produkt-/prisalternativ for en mangel.",
    input_schema: { type: "object", required: ["wishlist_id"], properties: {
      wishlist_id: str(), brand: str(), model: str(), size: str(), info: str(), link: str(),
      price: { type: "number", description: "kroner" } } } },
];

// Kjør ett verktøykall mot databasen. Returnerer { summary, action }.
async function runTool(env, name, input) {
  switch (name) {
    case "add_inventory": {
      const row = await db.createInventory(env, input);
      return { summary: `La til ${row.type} (${row.id})`, action: { kind: "inventory", op: "create", id: row.id, after: row } };
    }
    case "update_inventory": {
      const r = await db.updateInventory(env, input.id, input);
      if (!r) throw new Error("Fant ikke utstyr " + input.id);
      return { summary: `Oppdaterte ${r.after.type} (${r.after.id})`, action: { kind: "inventory", op: "update", id: r.after.id, before: r.before, after: r.after } };
    }
    case "delete_inventory": {
      const r = await db.deleteInventory(env, input.id);
      if (!r) throw new Error("Fant ikke utstyr " + input.id);
      return { summary: `Slettet ${r.before.type} (${input.id})`, action: { kind: "inventory", op: "delete", id: input.id, before: r.before } };
    }
    case "add_wishlist": {
      const row = await db.createWishlist(env, input);
      return { summary: `La til mangel ${row.type} (${row.id})`, action: { kind: "wishlist", op: "create", id: row.id, after: row } };
    }
    case "update_wishlist": {
      const r = await db.updateWishlist(env, input.id, input);
      if (!r) throw new Error("Fant ikke mangel " + input.id);
      return { summary: `Oppdaterte mangel ${r.after.type} (${r.after.id})`, action: { kind: "wishlist", op: "update", id: r.after.id, before: r.before, after: r.after } };
    }
    case "delete_wishlist": {
      const r = await db.deleteWishlist(env, input.id);
      if (!r) throw new Error("Fant ikke mangel " + input.id);
      return { summary: `Slettet mangel ${r.before.type} (${input.id})`, action: { kind: "wishlist", op: "delete", id: input.id, before: r.before } };
    }
    case "create_list": {
      const row = await db.createList(env, input);
      return { summary: `Opprettet listen «${row.name}» (${row.id})`, action: { kind: "list", op: "create", id: row.id, after: row } };
    }
    case "add_to_list": {
      await db.addToList(env, input.list_id, input.wishlist_id, input.qty);
      return { summary: `La ${input.wishlist_id} i liste ${input.list_id}`, action: { kind: "list_item", op: "add", list_id: input.list_id, wishlist_id: input.wishlist_id } };
    }
    case "remove_from_list": {
      await db.removeFromList(env, input.list_id, input.wishlist_id);
      return { summary: `Fjernet ${input.wishlist_id} fra liste ${input.list_id}`, action: { kind: "list_item", op: "remove", list_id: input.list_id, wishlist_id: input.wishlist_id } };
    }
    case "add_brand": {
      const row = await db.createBrand(env, input);
      return { summary: `La til merket ${row.name} (${row.id})`, action: { kind: "brand", op: "create", id: row.id, after: row } };
    }
    case "add_option": {
      const row = await db.createOption(env, input.wishlist_id, input);
      return { summary: `La til alternativ ${row.brand} ${row.model} (${row.id})`, action: { kind: "option", op: "create", id: row.id, after: row } };
    }
    default:
      throw new Error("Ukjent verktøy: " + name);
  }
}

async function callAnthropic(env, system, messages) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.AI_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: env.AI_MODEL || DEFAULT_MODEL, max_tokens: 1024, system, tools: TOOLS, messages }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

// POST /api/chat   { messages: [{role, content}] }
export async function chat(request, env) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;

  if (!env.AI_API_KEY) {
    return json({
      reply: "AI-assistenten er ikke aktivert ennå. Sett en secret kalt AI_API_KEY i Cloudflare for å skru den på.",
      configured: false, actions: [],
    });
  }

  let b;
  try { b = await request.json(); } catch { return err("Ugyldig JSON"); }
  const messages = (b.messages || []).map((m) => ({ role: m.role, content: m.content }));

  const [inv, wish, lists, brands] = await Promise.all([db.listInventory(env), db.listWishlist(env), db.listLists(env), db.listBrands(env)]);
  const system = `Du er assistenten til slagverkseksjonen i Randaberg Musikkorps.
Du holder orden på inventar, mangler, innkjøpslister og godkjente merker. Svar kort og på norsk.

Du KAN og SKAL bruke verktøyene til å utføre endringer direkte når brukeren ber om
det (legge til utstyr, registrere en mangel, opprette/fylle en innkjøpsliste, osv.).
Ikke be om bekreftelse – gjør endringen og fortell kort hva du gjorde. Bruk
eksisterende id-er fra dataene under når du oppdaterer/sletter/kobler. Hvis noe er
en erstatning for utstyr vi har i dårlig stand, sett replaces_inventory_id.

Gyldige verdier: kategori = Trommer|Melodisk|Pauker|Cymbaler|Stativer|Perkusjon,
status = ok|redusert|ødelagt, kvalitet = bra|greit|dårlig|ukjent, prioritet = høy|middels|lav.

Nåværende inventar: ${JSON.stringify(inv)}
Mangler (med alternativer): ${JSON.stringify(wish)}
Innkjøpslister: ${JSON.stringify(lists)}
Godkjente merker: ${JSON.stringify(brands)}`;

  const actions = [];
  const texts = [];
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const data = await callAnthropic(env, system, messages);
      const content = data.content || [];
      for (const c of content) if (c.type === "text" && c.text.trim()) texts.push(c.text.trim());

      const toolUses = content.filter((c) => c.type === "tool_use");
      if (data.stop_reason !== "tool_use" || !toolUses.length) break;

      messages.push({ role: "assistant", content });
      const results = [];
      for (const tu of toolUses) {
        try {
          const r = await runTool(env, tu.name, tu.input || {});
          if (r.action) actions.push(r.action);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: r.summary });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: "Feil: " + e.message, is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    return err("AI-tjenesten svarte med feil: " + e.message, 502);
  }

  return json({ reply: texts.join("\n") || "Gjort.", actions, configured: true });
}
