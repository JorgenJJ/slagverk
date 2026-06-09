import { json, err, requireAuth, newId } from "../helpers.js";

const FIELDS = ["type", "brand", "category", "status", "quality", "notes"];

// GET /api/inventory  → liste
export async function list(request, env) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  const { results } = await env.DB.prepare(
    "SELECT * FROM inventory ORDER BY category, type"
  ).all();
  return json(results);
}

// POST /api/inventory  → opprett
export async function create(request, env) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  let b;
  try { b = await request.json(); } catch { return err("Ugyldig JSON"); }
  if (!b.type || !b.category) return err("type og category er påkrevd");
  const id = b.id || newId("INV");
  await env.DB.prepare(
    `INSERT INTO inventory (id, type, brand, category, status, quality, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, b.type, b.brand || "", b.category,
    b.status || "ok", b.quality || "ukjent", b.notes || ""
  ).run();
  const row = await env.DB.prepare("SELECT * FROM inventory WHERE id = ?").bind(id).first();
  return json(row, 201);
}

// PUT /api/inventory/:id  → oppdater
export async function update(request, env, params) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  let b;
  try { b = await request.json(); } catch { return err("Ugyldig JSON"); }

  const sets = [], vals = [];
  for (const f of FIELDS) {
    if (f in b) { sets.push(`${f} = ?`); vals.push(b[f]); }
  }
  if (!sets.length) return err("Ingen felter å oppdatere");
  sets.push("updated_at = datetime('now')");
  vals.push(params.id);

  const res = await env.DB.prepare(
    `UPDATE inventory SET ${sets.join(", ")} WHERE id = ?`
  ).bind(...vals).run();
  if (!res.meta.changes) return err("Fant ikke utstyr", 404);

  const row = await env.DB.prepare("SELECT * FROM inventory WHERE id = ?").bind(params.id).first();
  return json(row);
}

// DELETE /api/inventory/:id
export async function remove(request, env, params) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  const res = await env.DB.prepare("DELETE FROM inventory WHERE id = ?").bind(params.id).run();
  if (!res.meta.changes) return err("Fant ikke utstyr", 404);
  return json({ ok: true });
}
