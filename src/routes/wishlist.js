import { json, err, requireAuth } from "../helpers.js";
import { ValidationError, listWishlist, createWishlist, updateWishlist, deleteWishlist, fulfillWishlist } from "../db.js";

async function body(request) {
  try { return await request.json(); } catch { throw new ValidationError("Ugyldig JSON"); }
}
const fail = (e) => err(e.message, e instanceof ValidationError ? 400 : 500);

// GET /api/wishlist
export async function list(request, env) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  return json(await listWishlist(env));
}

// POST /api/wishlist
export async function create(request, env) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  try { return json(await createWishlist(env, await body(request)), 201); }
  catch (e) { return fail(e); }
}

// PUT /api/wishlist/:id
export async function update(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  try {
    const res = await updateWishlist(env, params.id, await body(request));
    return res ? json(res.after) : err("Fant ikke element", 404);
  } catch (e) { return fail(e); }
}

// DELETE /api/wishlist/:id
export async function remove(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  const res = await deleteWishlist(env, params.id);
  return res ? json({ ok: true }) : err("Fant ikke element", 404);
}

// POST /api/wishlist/:id/fulfill  { option_id? }  → marker kjøpt
export async function fulfill(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  try { const b = await body(request).catch(() => ({})); return json(await fulfillWishlist(env, params.id, b && b.option_id)); }
  catch (e) { return fail(e); }
}
