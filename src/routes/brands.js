import { json, err, requireAuth } from "../helpers.js";
import { ValidationError, listBrands, createBrand, updateBrand, deleteBrand } from "../db.js";

async function body(request) {
  try { return await request.json(); } catch { throw new ValidationError("Ugyldig JSON"); }
}
const fail = (e) => err(e.message, e instanceof ValidationError ? 400 : 500);

// GET /api/brands
export async function list(request, env) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  return json(await listBrands(env));
}
// POST /api/brands
export async function create(request, env) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  try { return json(await createBrand(env, await body(request)), 201); } catch (e) { return fail(e); }
}
// PUT /api/brands/:id
export async function update(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  try { const res = await updateBrand(env, params.id, await body(request)); return res ? json(res.after) : err("Fant ikke merket", 404); }
  catch (e) { return fail(e); }
}
// DELETE /api/brands/:id
export async function remove(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  const res = await deleteBrand(env, params.id);
  return res ? json({ ok: true }) : err("Fant ikke merket", 404);
}
