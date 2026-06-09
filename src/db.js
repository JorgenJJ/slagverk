// ── Datatilgang ──
// All lese-/skrivelogikk samlet ett sted, slik at både REST-rutene og
// AI-chattens verktøy (tool use) bruker nøyaktig samme operasjoner.
// Funksjonene kaster ValidationError ved ugyldig input; kallere mapper det
// til HTTP 400 / tool_result-feil.

import { newId } from "./helpers.js";

export class ValidationError extends Error {}

const INV_FIELDS  = ["type", "brand", "model", "size", "category", "status", "quality", "notes"];
const WISH_FIELDS = ["type", "category", "priority", "estimated_price", "link", "notes", "budgeted", "replaces_inventory_id"];
const LIST_FIELDS = ["name", "sort_order", "budget", "notes"];

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

// ───────────────────────── Inventory ─────────────────────────

export async function listInventory(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM inventory ORDER BY category, type"
  ).all();
  return results;
}

export async function getInventory(env, id) {
  return env.DB.prepare("SELECT * FROM inventory WHERE id = ?").bind(id).first();
}

export async function createInventory(env, b) {
  if (!b.type || !b.category) throw new ValidationError("type og category er påkrevd");
  const id = b.id || newId("INV");
  await env.DB.prepare(
    `INSERT INTO inventory (id, type, brand, model, size, category, status, quality, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, b.type, b.brand || "", b.model || "", b.size || "", b.category,
    b.status || "ok", b.quality || "ukjent", b.notes || ""
  ).run();
  return getInventory(env, id);
}

export async function updateInventory(env, id, b) {
  const before = await getInventory(env, id);
  if (!before) return null;
  const sets = [], vals = [];
  for (const f of INV_FIELDS) if (f in b) { sets.push(`${f} = ?`); vals.push(b[f]); }
  if (!sets.length) throw new ValidationError("Ingen felter å oppdatere");
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  await env.DB.prepare(`UPDATE inventory SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return { before, after: await getInventory(env, id) };
}

export async function deleteInventory(env, id) {
  const before = await getInventory(env, id);
  if (!before) return null;
  // Nullstill erstatnings-koblinger som peker hit
  await env.DB.prepare("UPDATE wishlist SET replaces_inventory_id = NULL WHERE replaces_inventory_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM inventory WHERE id = ?").bind(id).run();
  return { before };
}

// ───────────────────────── Wishlist (mangler) ─────────────────────────

export async function listWishlist(env) {
  const { results } = await env.DB.prepare("SELECT * FROM wishlist").all();
  const { results: opts } = await env.DB.prepare("SELECT * FROM wishlist_options ORDER BY price").all();
  const byWish = {};
  for (const o of opts) (byWish[o.wishlist_id] ||= []).push(o);
  // Hver mangel får sine produkt-/prisalternativer hektet på.
  return results.map((w) => ({ ...w, options: byWish[w.id] || [] }));
}

export async function getWishlist(env, id) {
  return env.DB.prepare("SELECT * FROM wishlist WHERE id = ?").bind(id).first();
}

export async function createWishlist(env, b) {
  if (!b.type || !b.category) throw new ValidationError("type og category er påkrevd");
  const id = b.id || newId("W");
  await env.DB.prepare(
    `INSERT INTO wishlist (id, type, category, priority, estimated_price, link, notes, budgeted, replaces_inventory_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, b.type, b.category, b.priority || "middels",
    num(b.estimated_price), b.link || "", b.notes || "",
    b.budgeted ? 1 : 0, b.replaces_inventory_id || null
  ).run();
  return getWishlist(env, id);
}

export async function updateWishlist(env, id, b) {
  const before = await getWishlist(env, id);
  if (!before) return null;
  const sets = [], vals = [];
  for (const f of WISH_FIELDS) {
    if (f in b) {
      sets.push(`${f} = ?`);
      if (f === "budgeted") vals.push(b[f] ? 1 : 0);
      else if (f === "estimated_price") vals.push(num(b[f]));
      else if (f === "replaces_inventory_id") vals.push(b[f] || null);
      else vals.push(b[f]);
    }
  }
  if (!sets.length) throw new ValidationError("Ingen felter å oppdatere");
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  await env.DB.prepare(`UPDATE wishlist SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return { before, after: await getWishlist(env, id) };
}

export async function deleteWishlist(env, id) {
  const before = await getWishlist(env, id);
  if (!before) return null;
  await env.DB.prepare("DELETE FROM list_items WHERE wishlist_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM wishlist_options WHERE wishlist_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM wishlist WHERE id = ?").bind(id).run();
  return { before };
}

// ───────────────────────── Innkjøpslister ─────────────────────────

export async function listLists(env) {
  const { results: lists } = await env.DB.prepare(
    "SELECT * FROM lists ORDER BY sort_order, created_at"
  ).all();
  const { results: members } = await env.DB.prepare("SELECT * FROM list_items").all();
  const byList = {};
  for (const m of members) (byList[m.list_id] ||= []).push({ wishlist_id: m.wishlist_id, qty: m.qty, option_id: m.option_id });
  return lists.map((l) => ({ ...l, items: byList[l.id] || [] }));
}

export async function getList(env, id) {
  return env.DB.prepare("SELECT * FROM lists WHERE id = ?").bind(id).first();
}

export async function createList(env, b) {
  if (!b.name) throw new ValidationError("name er påkrevd");
  const id = b.id || newId("L");
  await env.DB.prepare(
    "INSERT INTO lists (id, name, sort_order, budget, notes) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, b.name, Number(b.sort_order) || 0, num(b.budget), b.notes || "").run();
  return getList(env, id);
}

export async function updateList(env, id, b) {
  const before = await getList(env, id);
  if (!before) return null;
  const sets = [], vals = [];
  for (const f of LIST_FIELDS) {
    if (f in b) {
      sets.push(`${f} = ?`);
      vals.push(f === "budget" ? num(b[f]) : f === "sort_order" ? Number(b[f]) || 0 : b[f]);
    }
  }
  if (!sets.length) throw new ValidationError("Ingen felter å oppdatere");
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  await env.DB.prepare(`UPDATE lists SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return { before, after: await getList(env, id) };
}

export async function deleteList(env, id) {
  const before = await getList(env, id);
  if (!before) return null;
  await env.DB.prepare("DELETE FROM list_items WHERE list_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM lists WHERE id = ?").bind(id).run();
  return { before };
}

export async function addToList(env, listId, wishlistId, qty = 1, optionId = null) {
  if (!(await getList(env, listId))) throw new ValidationError("Fant ikke listen");
  if (!(await getWishlist(env, wishlistId))) throw new ValidationError("Fant ikke mangelen");
  await env.DB.prepare(
    `INSERT INTO list_items (list_id, wishlist_id, qty, option_id) VALUES (?, ?, ?, ?)
     ON CONFLICT(list_id, wishlist_id) DO UPDATE SET qty = excluded.qty, option_id = excluded.option_id`
  ).bind(listId, wishlistId, Number(qty) || 1, optionId || null).run();
  return { ok: true };
}

export async function removeFromList(env, listId, wishlistId) {
  const res = await env.DB.prepare(
    "DELETE FROM list_items WHERE list_id = ? AND wishlist_id = ?"
  ).bind(listId, wishlistId).run();
  return { ok: !!res.meta.changes };
}

// ───────────────────────── Godkjente merker ─────────────────────────

const BRAND_FIELDS = ["name", "category", "notes", "sort_order"];

export async function listBrands(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM brands ORDER BY category, sort_order, name"
  ).all();
  return results;
}
export async function getBrand(env, id) {
  return env.DB.prepare("SELECT * FROM brands WHERE id = ?").bind(id).first();
}
export async function createBrand(env, b) {
  if (!b.name) throw new ValidationError("name er påkrevd");
  const id = b.id || newId("BR");
  await env.DB.prepare(
    "INSERT INTO brands (id, name, category, notes, sort_order) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, b.name, b.category || "Generelt", b.notes || "", Number(b.sort_order) || 0).run();
  return getBrand(env, id);
}
export async function updateBrand(env, id, b) {
  const before = await getBrand(env, id);
  if (!before) return null;
  const sets = [], vals = [];
  for (const f of BRAND_FIELDS) if (f in b) { sets.push(`${f} = ?`); vals.push(f === "sort_order" ? Number(b[f]) || 0 : b[f]); }
  if (!sets.length) throw new ValidationError("Ingen felter å oppdatere");
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  await env.DB.prepare(`UPDATE brands SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return { before, after: await getBrand(env, id) };
}
export async function deleteBrand(env, id) {
  const before = await getBrand(env, id);
  if (!before) return null;
  await env.DB.prepare("DELETE FROM brands WHERE id = ?").bind(id).run();
  return { before };
}

// ───────────────────────── Mangel-alternativer ─────────────────────────

const OPT_FIELDS = ["brand", "model", "size", "info", "link", "price"];

export async function getOption(env, id) {
  return env.DB.prepare("SELECT * FROM wishlist_options WHERE id = ?").bind(id).first();
}
export async function createOption(env, wishlistId, b) {
  if (!(await getWishlist(env, wishlistId))) throw new ValidationError("Fant ikke mangelen");
  const id = b.id || newId("OPT");
  await env.DB.prepare(
    `INSERT INTO wishlist_options (id, wishlist_id, brand, model, size, info, link, price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, wishlistId, b.brand || "", b.model || "", b.size || "", b.info || "", b.link || "", num(b.price)).run();
  return getOption(env, id);
}
export async function updateOption(env, id, b) {
  const before = await getOption(env, id);
  if (!before) return null;
  const sets = [], vals = [];
  for (const f of OPT_FIELDS) if (f in b) { sets.push(`${f} = ?`); vals.push(f === "price" ? num(b[f]) : b[f]); }
  if (!sets.length) throw new ValidationError("Ingen felter å oppdatere");
  vals.push(id);
  await env.DB.prepare(`UPDATE wishlist_options SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
  return { before, after: await getOption(env, id) };
}
export async function deleteOption(env, id) {
  const before = await getOption(env, id);
  if (!before) return null;
  await env.DB.prepare("DELETE FROM wishlist_options WHERE id = ?").bind(id).run();
  return { before };
}
