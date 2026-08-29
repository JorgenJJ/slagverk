// ── Datatilgang ──
// All lese-/skrivelogikk samlet ett sted, slik at både REST-rutene og
// AI-chattens verktøy (tool use) bruker nøyaktig samme operasjoner.
// Funksjonene kaster ValidationError ved ugyldig input; kallere mapper det
// til HTTP 400 / tool_result-feil.

import { newId } from "./helpers.js";

export class ValidationError extends Error {}

const INV_FIELDS  = ["type", "brand", "model", "size", "category", "status", "quality", "notes", "parent_id", "retired_at"];
const WISH_FIELDS = ["type", "category", "priority", "estimated_price", "link", "notes", "budgeted", "replaces_inventory_id"];
const LIST_FIELDS = ["name", "sort_order", "budget", "notes", "archived_at"];

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
    `INSERT INTO inventory (id, type, brand, model, size, category, status, quality, notes, parent_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, b.type, b.brand || "", b.model || "", b.size || "", b.category,
    b.status || "ok", b.quality || "ukjent", b.notes || "", b.parent_id || null
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

// Alle etterkommer-id-er (deler, underdeler …) under en node.
async function descendantIds(env, id) {
  const { results } = await env.DB.prepare("SELECT id, parent_id FROM inventory").all();
  const childrenOf = {};
  for (const r of results) (childrenOf[r.parent_id] ||= []).push(r.id);
  const out = [], stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const c of (childrenOf[cur] || [])) { out.push(c); stack.push(c); }
  }
  return out;
}

export async function deleteInventory(env, id) {
  const before = await getInventory(env, id);
  if (!before) return null;
  // Kaskade: slett noden OG alle underdeler.
  const ids = [id, ...(await descendantIds(env, id))];
  for (const d of ids) {
    await env.DB.prepare("UPDATE wishlist SET replaces_inventory_id = NULL WHERE replaces_inventory_id = ?").bind(d).run();
  }
  const ph = ids.map(() => "?").join(",");
  await env.DB.prepare(`DELETE FROM inventory WHERE id IN (${ph})`).bind(...ids).run();
  return { before, deletedCount: ids.length };
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
  // En liste-linje ER et produkt (option_id); wishlist_id er tilbake-ref til mangelen.
  for (const m of members) (byList[m.list_id] ||= []).push({ option_id: m.option_id, wishlist_id: m.wishlist_id, qty: m.qty });
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

// Legg et PRODUKT (et alternativ) i en liste. Ikke mulig å legge en mangel uten
// produkt – option_id er påkrevd. Mangelen utledes av produktets wishlist_id.
export async function addToList(env, listId, optionId, qty = 1) {
  if (!(await getList(env, listId))) throw new ValidationError("Fant ikke listen");
  const opt = await getOption(env, optionId);
  if (!opt) throw new ValidationError("Fant ikke produktet (alternativet). En liste kan kun inneholde konkrete produkter.");
  await env.DB.prepare(
    `INSERT INTO list_items (list_id, option_id, wishlist_id, qty) VALUES (?, ?, ?, ?)
     ON CONFLICT(list_id, option_id) DO UPDATE SET qty = excluded.qty`
  ).bind(listId, optionId, opt.wishlist_id, Number(qty) || 1).run();
  return { ok: true };
}

export async function removeFromList(env, listId, optionId) {
  const res = await env.DB.prepare(
    "DELETE FROM list_items WHERE list_id = ? AND option_id = ?"
  ).bind(listId, optionId).run();
  return { ok: !!res.meta.changes };
}

// ───────────────────────── Godkjente merker ─────────────────────────

// Et merke kan høre til flere kategorier. Kanonisk form er JSON-arrayen
// `categories`; `category` speiler den første, så eldre rader, sorteringen under
// og AI-verktøyenes enum fortsatt virker. Les ALLTID via brandCategories().
export function brandCategories(b) {
  if (!b) return [];
  if (b.categories) {
    try { const a = JSON.parse(b.categories); if (Array.isArray(a) && a.length) return a.map(String); } catch { /* faller tilbake */ }
  }
  return b.category ? [b.category] : [];
}
// Godtar `categories` (array eller JSON-streng) og/eller `category` (én verdi).
// Returnerer null når kalleren ikke rørte kategori i det hele tatt.
function brandCatColumns(b) {
  let cats = b.categories !== undefined ? b.categories
    : b.category !== undefined ? [b.category] : undefined;
  if (cats === undefined) return null;
  if (typeof cats === "string") { try { cats = JSON.parse(cats); } catch { cats = [cats]; } }
  if (!Array.isArray(cats)) cats = [cats];
  cats = [...new Set(cats.filter(Boolean).map(String))];
  if (!cats.length) cats = ["Generelt"];
  return { category: cats[0], categories: JSON.stringify(cats) };
}

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
  const cats = brandCatColumns(b) || { category: "Generelt", categories: JSON.stringify(["Generelt"]) };
  await env.DB.prepare(
    "INSERT INTO brands (id, name, category, categories, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, b.name, cats.category, cats.categories, b.notes || "", Number(b.sort_order) || 0).run();
  return getBrand(env, id);
}
export async function updateBrand(env, id, b) {
  const before = await getBrand(env, id);
  if (!before) return null;
  const sets = [], vals = [];
  for (const f of ["name", "notes", "sort_order"]) if (f in b) { sets.push(`${f} = ?`); vals.push(f === "sort_order" ? Number(b[f]) || 0 : b[f]); }
  // category/categories skrives alltid som par, aldri hver for seg.
  const cats = brandCatColumns(b);
  if (cats) { sets.push("category = ?", "categories = ?"); vals.push(cats.category, cats.categories); }
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
  const after = await getOption(env, id);
  // Synk mangelen når det «gjeldende» alternativet endres, så pris/lenke/størrelse
  // aldri kommer i utakt (uansett om endringen kom fra UI eller AI).
  const synced = await syncWishlistFromOption(env, before, after);
  return { before, after, synced };
}

// Speil endringer i et alternativ tilbake til mangelen, men bare når alternativet
// er det «valgte»: det ligger i en innkjøpsliste, eller er mangelens eneste.
// Returnerer { before, after } for wishlist-raden hvis noe ble synket, ellers null.
async function syncWishlistFromOption(env, optBefore, optAfter) {
  const w = await getWishlist(env, optAfter.wishlist_id);
  if (!w) return null;
  const inList = await env.DB.prepare("SELECT 1 FROM list_items WHERE option_id = ? LIMIT 1").bind(optAfter.id).first();
  if (!inList) {
    const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM wishlist_options WHERE wishlist_id = ?").bind(optAfter.wishlist_id).first();
    if (!cnt || cnt.n !== 1) return null;
  }
  const patch = {};
  if (optAfter.price !== optBefore.price && optAfter.price !== null) patch.estimated_price = optAfter.price;
  if (optAfter.link !== optBefore.link && optAfter.link) patch.link = optAfter.link;
  // Størrelse: ren streng-heuristikk – bytt gammel size i mangel-teksten hvis den står der.
  if (optAfter.size !== optBefore.size && optBefore.size && optAfter.size && w.type.includes(optBefore.size)) {
    patch.type = w.type.split(optBefore.size).join(optAfter.size);
  }
  if (!Object.keys(patch).length) return null;
  return updateWishlist(env, w.id, patch);
}
export async function deleteOption(env, id) {
  const before = await getOption(env, id);
  if (!before) return null;
  await env.DB.prepare("DELETE FROM list_items WHERE option_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM wishlist_options WHERE id = ?").bind(id).run();
  return { before };
}

// ───────────────────────── Oppfyllelse (kjøpt) ─────────────────────────

// Oppfyll én mangel: produktet (valgt alternativ) blir nytt inventar, mangelen
// fjernes, og evt. erstattet utstyr merkes «utgått» (bevart, men skjult).
export async function fulfillWishlist(env, wishlistId, optionId) {
  const w = await getWishlist(env, wishlistId);
  if (!w) throw new ValidationError("Fant ikke mangelen");
  const opt = optionId ? await getOption(env, optionId) : null;

  let parent_id = null;
  if (w.replaces_inventory_id) {
    const old = await getInventory(env, w.replaces_inventory_id);
    if (old) {
      parent_id = old.parent_id || null; // nytt arver tre-posisjon
      await env.DB.prepare("UPDATE inventory SET retired_at = datetime('now') WHERE id = ?").bind(old.id).run();
    }
  }
  const link = opt && opt.link ? " – " + opt.link : (w.link ? " – " + w.link : "");
  const row = await createInventory(env, {
    type: w.type, category: w.category,
    brand: (opt && opt.brand) || "", model: (opt && opt.model) || "", size: (opt && opt.size) || "",
    status: "ok", quality: "bra", notes: "Kjøpt" + link, parent_id,
  });
  await deleteWishlist(env, wishlistId); // fjerner mangel + alternativer + liste-koblinger
  return { inventory: row, retired: w.replaces_inventory_id || null, mangel: w.type };
}

// Oppfyll en hel innkjøpsliste, og arkiver den.
export async function fulfillList(env, listId) {
  const l = await getList(env, listId);
  if (!l) throw new ValidationError("Fant ikke listen");
  const { results: items } = await env.DB.prepare("SELECT * FROM list_items WHERE list_id = ?").bind(listId).all();
  const created = [];
  for (const it of items) {
    try { const r = await fulfillWishlist(env, it.wishlist_id, it.option_id); created.push(r.mangel); }
    catch { /* mangel kan alt være oppfylt via en annen liste */ }
  }
  await env.DB.prepare("UPDATE lists SET archived_at = datetime('now') WHERE id = ?").bind(listId).run();
  return { count: created.length, created };
}
