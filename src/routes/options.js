import { json, err, requireAuth } from "../helpers.js";
import { ValidationError, createOption, updateOption, deleteOption } from "../db.js";

async function body(request) {
  try { return await request.json(); } catch { throw new ValidationError("Ugyldig JSON"); }
}
const fail = (e) => err(e.message, e instanceof ValidationError ? 400 : 500);

// POST /api/wishlist/:id/options  → nytt produkt-/prisalternativ for en mangel
export async function create(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  try { return json(await createOption(env, params.id, await body(request)), 201); } catch (e) { return fail(e); }
}
// PUT /api/options/:id
export async function update(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  try { const res = await updateOption(env, params.id, await body(request)); return res ? json(res.after) : err("Fant ikke alternativet", 404); }
  catch (e) { return fail(e); }
}
// DELETE /api/options/:id
export async function remove(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  const res = await deleteOption(env, params.id);
  return res ? json({ ok: true }) : err("Fant ikke alternativet", 404);
}
