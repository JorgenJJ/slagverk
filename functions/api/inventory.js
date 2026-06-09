import { json, err, requireAuth, newId } from "./_helpers.js";

// GET /api/inventory  → liste
export async function onRequestGet({ request, env }) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  const { results } = await env.DB.prepare(
    "SELECT * FROM inventory ORDER BY category, type"
  ).all();
  return json(results);
}

// POST /api/inventory  → opprett
export async function onRequestPost({ request, env }) {
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
