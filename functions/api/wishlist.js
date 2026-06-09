import { json, err, requireAuth, newId } from "./_helpers.js";

// GET /api/wishlist
export async function onRequestGet({ request, env }) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  const { results } = await env.DB.prepare("SELECT * FROM wishlist").all();
  return json(results);
}

// POST /api/wishlist
export async function onRequestPost({ request, env }) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  let b;
  try { b = await request.json(); } catch { return err("Ugyldig JSON"); }
  if (!b.type || !b.category) return err("type og category er påkrevd");
  const id = b.id || newId("W");
  await env.DB.prepare(
    `INSERT INTO wishlist (id, type, category, priority, estimated_price, link, notes, budgeted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, b.type, b.category, b.priority || "middels",
    b.estimated_price ?? null, b.link || "", b.notes || "",
    b.budgeted ? 1 : 0
  ).run();
  const row = await env.DB.prepare("SELECT * FROM wishlist WHERE id = ?").bind(id).first();
  return json(row, 201);
}
