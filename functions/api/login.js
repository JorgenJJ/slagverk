import { json, requireAuth } from "./_helpers.js";

// POST /api/login  → sjekker tilgangskode
export async function onRequestPost({ request, env }) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;
  return json({ ok: true });
}
