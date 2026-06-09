import { json, err, requireAuth } from "../_helpers.js";

const FIELDS = ["type", "category", "priority", "estimated_price", "link", "notes", "budgeted"];

// PUT /api/wishlist/:id
export async function onRequestPut({ request, env, params }) {
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
export async function onRequestDelete({ request, env, params }) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  const res = await env.DB.prepare("DELETE FROM wishlist WHERE id = ?").bind(params.id).run();
  if (!res.meta.changes) return err("Fant ikke element", 404);
  return json({ ok: true });
}
