import { json, err, requireAuth } from "../helpers.js";
import { fetchProductPrice } from "../store.js";

// POST /api/price   { url }  →  { price, candidates, source }
// Henter pris fra en konkret produkt-URL hos en godkjent butikk (server-side).
export async function price(request, env) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  let b;
  try { b = await request.json(); } catch { return err("Ugyldig JSON"); }
  if (!b.url) return err("url er påkrevd");
  const r = await fetchProductPrice(env, b.url);
  if (r.error) return err(r.error, 502);
  return json(r);
}
