// ── Butikk-integrasjon ──
// Søk opp ekte produkter og hent priser fra de foretrukne butikkene
// (PREFERRED_STORES). Alt går server-side fra Worker-en (ingen CORS), og er låst
// til godkjente verter (anti-SSRF). Delt av /api/price, /api/search og AI-chatten.

import { allowedHosts, preferredStores } from "./helpers.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Validér at en URL peker på en godkjent butikk (https). Returnerer URL-objekt
// eller null.
export function allowedUrl(env, urlStr) {
  let url;
  try { url = new URL(urlStr); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  return allowedHosts(env).some((h) => host === h || host.endsWith("." + h)) ? url : null;
}

// Finn kronebeløp i sidetekst. Format hos musikk-miljø: «32 880 kr».
export function extractPrices(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const out = [];
  const re = /(\d[\d.\s ]{2,})\s*kr\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1].replace(/[.\s ]/g, ""), 10);
    if (Number.isFinite(n) && n >= 100 && n <= 10_000_000) out.push(n);
  }
  return out;
}

// Hent pris fra en konkret produkt-URL. { price, candidates, source } eller { error }.
export async function fetchProductPrice(env, urlStr) {
  const url = allowedUrl(env, urlStr);
  if (!url) return { error: `Pris kan kun hentes fra: ${allowedHosts(env).join(", ")}` };
  let resp;
  try {
    resp = await fetch(url.toString(), { headers: { "User-Agent": UA, "Accept-Language": "nb,no;q=0.9" } });
  } catch (e) { return { error: "Klarte ikke hente siden: " + e.message }; }
  if (!resp.ok) return { error: `Leverandørsiden svarte ${resp.status}` };
  const candidates = extractPrices(await resp.text());
  if (!candidates.length) {
    return { price: null, candidates: [], source: url.toString(),
      note: "Fant ingen pris i sideteksten – siden kan være endret eller krever JavaScript." };
  }
  // Salgspris = laveste av de to første treffene (ordinær + salg står sammen øverst).
  return { price: Math.min(...candidates.slice(0, 2)), candidates, source: url.toString() };
}

// Per-butikk søkekonfig. Hello Retail-nøklene er offentlige (eksponert i
// nettleseren) – samme som butikkens egen frontend bruker. Ny butikk = ny linje.
const STORE_SEARCH = {
  "musikk-miljo.no": {
    type: "helloretail",
    endpoint: "https://core.helloretail.com/api/v1/search/partnerSearch",
    key: "d623ef77-a4ff-44ca-a967-3a817e217ea1",
    websiteUuid: "992f781e-22bf-404d-9d7e-a2f00205e10c",
  },
};

// ── Hello Retail (butikkens ekte søk: relevans + paginering) ──
// Svaret er HTML i `result`-feltet + total i `results`. Vi parser produktkortene.
function parsePrice(s) { const n = parseInt(String(s).replace(/[.\s ]/g, ""), 10); return Number.isFinite(n) ? n : null; }
function parseHelloRetail(html) {
  const out = [];
  const cards = String(html || "").split('class="hr-search-overlay-product"').slice(1);
  for (const card of cards) {
    const href = card.match(/href="([^"]+)"/);
    if (!href) continue;
    const url = href[1].split("#")[0];
    const title = card.match(/product-title">\s*([\s\S]*?)\s*<\/p>/);
    const name = title ? title[1].replace(/\s+/g, " ").trim() : "";
    const sale = card.match(/product-price-sale">\s*([\d.\s ]+?)\s*kr/);
    const any = card.match(/product-price[^"]*">\s*([\d.\s ]+?)\s*kr/);
    const price = sale ? parsePrice(sale[1]) : (any ? parsePrice(any[1]) : null);
    out.push({ name, url, price });
  }
  return out;
}
async function helloRetailSearch(cfg, q, start, count) {
  const body = new URLSearchParams({
    key: cfg.key, q, device_type: "DESKTOP",
    product_count: String(count), product_start: String(start),
    category_count: "0", category_start: "0",
    return_filters: "false", websiteUuid: cfg.websiteUuid,
    trackingUserId: "000000000000000000000000",
  });
  const resp = await fetch(cfg.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, Accept: "*/*" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Hello Retail svarte ${resp.status}`);
  const data = await resp.json();
  return { products: parseHelloRetail(data.result), total: Number(data.results) || 0 };
}

// ── nopCommerce autocomplete (reserve hvis butikken ikke har Hello Retail) ──
async function nopFallback(origin, q, limit) {
  const tokens = q.split(/\s+/).filter(Boolean);
  const tries = [q, ...tokens.filter((t) => t.length >= 3).sort((a, b) => b.length - a.length)];
  let results = [];
  for (const term of tries) {
    try {
      const resp = await fetch(`${origin}/catalog/searchtermautocomplete?term=${encodeURIComponent(term)}`,
        { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (Array.isArray(data)) results = data.filter((it) => it && it.producturl)
        .map((it) => ({ name: it.label || "", url: new URL(it.producturl, origin).toString(), price: null }));
    } catch { /* prøv neste */ }
    if (results.length) break;
  }
  const lc = tokens.map((t) => t.toLowerCase());
  const refined = results.filter((r) => lc.every((t) => (r.name || "").toLowerCase().includes(t)));
  return (refined.length ? refined : results).slice(0, limit);
}

// Søk i de foretrukne butikkene etter EKTE produkter (navn, URL, evt. pris).
// Bruker butikkens eget søk (Hello Retail) når konfigurert, ellers nopCommerce
// autocomplete. `start` gir paginering (Hello Retail). Returnerer [{name,url,price,store}].
export async function searchStore(env, query, limit = 10, start = 0) {
  const q = String(query || "").trim();
  if (!q) return [];
  const results = [];
  for (const store of preferredStores(env)) {
    let host, origin;
    try { const u = new URL(store); host = u.hostname.replace(/^www\./, ""); origin = u.origin; } catch { continue; }
    const cfg = STORE_SEARCH[host];
    if (cfg && cfg.type === "helloretail") {
      try {
        const hr = await helloRetailSearch(cfg, q, start, limit);
        if (hr.products.length) { results.push(...hr.products.map((p) => ({ ...p, store: host }))); continue; }
      } catch { /* fall tilbake til autocomplete */ }
    }
    results.push(...(await nopFallback(origin, q, limit)).map((p) => ({ ...p, store: host })));
  }
  const seen = new Set(); const out = [];
  for (const r of results) { if (r.url && !seen.has(r.url)) { seen.add(r.url); out.push(r); } }
  return out.slice(0, limit);
}
