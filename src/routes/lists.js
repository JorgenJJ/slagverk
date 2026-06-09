import { json, err, requireAuth } from "../helpers.js";
import {
  ValidationError, listLists, createList, updateList, deleteList,
  addToList, removeFromList, fulfillList,
} from "../db.js";

async function body(request) {
  try { return await request.json(); } catch { throw new ValidationError("Ugyldig JSON"); }
}
const fail = (e) => err(e.message, e instanceof ValidationError ? 400 : 500);

// GET /api/lists
export async function list(request, env) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  return json(await listLists(env));
}

// POST /api/lists
export async function create(request, env) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  try { return json(await createList(env, await body(request)), 201); }
  catch (e) { return fail(e); }
}

// PUT /api/lists/:id
export async function update(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  try {
    const res = await updateList(env, params.id, await body(request));
    return res ? json(res.after) : err("Fant ikke listen", 404);
  } catch (e) { return fail(e); }
}

// DELETE /api/lists/:id
export async function remove(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  const res = await deleteList(env, params.id);
  return res ? json({ ok: true }) : err("Fant ikke listen", 404);
}

// POST /api/lists/:id/items   { option_id, qty? }  – legg et PRODUKT i lista
export async function addItem(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  try {
    const b = await body(request);
    if (!b.option_id) throw new ValidationError("option_id er påkrevd – en liste kan kun inneholde konkrete produkter");
    return json(await addToList(env, params.id, b.option_id, b.qty));
  } catch (e) { return fail(e); }
}

// DELETE /api/lists/:id/items/:optionId
export async function removeItem(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  const res = await removeFromList(env, params.id, params.optionId);
  return res.ok ? json({ ok: true }) : err("Fant ikke varen i listen", 404);
}

// POST /api/lists/:id/fulfill  → marker hele lista kjøpt (oppfyll + arkiver)
export async function fulfill(request, env, params) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  try { return json(await fulfillList(env, params.id)); } catch (e) { return fail(e); }
}
