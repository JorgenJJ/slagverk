import { json, err, requireAuth } from "../helpers.js";
import { searchStore } from "../store.js";

// GET /api/search?q=...&limit=&start=  →  { results: [{ name, url, price, store }] }
// Søk opp ekte produkter i de foretrukne butikkene. `start` gir paginering.
export async function search(request, env) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;
  const p = new URL(request.url).searchParams;
  const q = p.get("q") || "";
  if (!q.trim()) return err("q er påkrevd");
  const limit = Math.min(30, Math.max(1, parseInt(p.get("limit") || "10", 10) || 10));
  const start = Math.max(0, parseInt(p.get("start") || "0", 10) || 0);
  return json({ results: await searchStore(env, q, limit, start) });
}
