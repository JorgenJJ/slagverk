import { json, requireAuth } from "../helpers.js";

// POST /api/login  → sjekker tilgangskode
export async function login(request, env) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  return json({ ok: true });
}
