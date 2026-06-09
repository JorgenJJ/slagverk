import { json, err, requireAuth, newId } from "../helpers.js";

const FIELDS = ["type", "category", "priority", "estimated_price", "link", "notes", "budgeted"];

// GET /api/wishlist
export async function list(request, env) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  const { results } = await env.DB.prepare("SELECT * FROM wishlist").all();
  return json(results);
}

// POST /api/wishlist
export async function create(request, env) {
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

// PUT /api/wishlist/:id
export async function update(request, env, params) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  let b;
  try { b = await request.json(); } catch { return err("Ugyldig JSON"); }

  const sets = [], vals = [];
  for (const f of FIELDS) {
    if (f in b) {
      sets.push(`${f} = ?`);
      vals.push(f === "budgeted" ? (b[f] ? 1 : 0) : b[f]);
    }
  }
  if (!sets.length) return err("Ingen felter å oppdatere");
  sets.push("updated_at = datetime('now')");
  vals.push(params.id);

  const res = await env.DB.prepare(
    `UPDATE wishlist SET ${sets.join(", ")} WHERE id = ?`
  ).bind(...vals).run();
  if (!res.meta.changes) return err("Fant ikke element", 404);

  const row = await env.DB.prepare("SELECT * FROM wishlist WHERE id = ?").bind(params.id).first();
  return json(row);
}

// DELETE /api/wishlist/:id
export async function remove(request, env, params) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  const res = await env.DB.prepare("DELETE FROM wishlist WHERE id = ?").bind(params.id).run();
  if (!res.meta.changes) return err("Fant ikke element", 404);
  return json({ ok: true });
}
