import { json, err, requireAuth, allowedHosts } from "../helpers.js";

// Tillatte leverandør-domener utledes fra de foretrukne butikkene (PREFERRED_STORES)
// – hindrer at endepunktet brukes som åpen proxy/SSRF.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Finn kronebeløp i sidetekst. Format hos musikk-miljø: «32 880 kr»
// (mellomrom/hardt mellomrom som tusenskille). Returnerer heltall (kr).
function extractPrices(html) {
  // Fjern script/style for å unngå falske treff
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
                   .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const out = [];
  const re = /(\d[\d.   ]{2,})\s*kr\b/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1].replace(/[.  \s]/g, ""), 10);
    if (Number.isFinite(n) && n >= 100 && n <= 10_000_000) out.push(n);
  }
  return out;
}

// POST /api/price   { url }  →  { price, candidates, source }
export async function price(request, env) {
  const unauth = requireAuth(request, env); if (unauth) return unauth;

  let b;
  try { b = await request.json(); } catch { return err("Ugyldig JSON"); }
  if (!b.url) return err("url er påkrevd");

  let url;
  try { url = new URL(b.url); } catch { return err("Ugyldig URL"); }
  if (url.protocol !== "https:") return err("Kun https-lenker støttes");
  const host = url.hostname.replace(/^www\./, "");
  const hosts = allowedHosts(env);
  if (!hosts.some((h) => host === h || host.endsWith("." + h))) {
    return err(`Pris kan kun hentes fra: ${hosts.join(", ")}`, 400);
  }

  let resp;
  try {
    resp = await fetch(url.toString(), { headers: { "User-Agent": UA, "Accept-Language": "nb,no;q=0.9" } });
  } catch (e) {
    return err("Klarte ikke hente siden: " + e.message, 502);
  }
  if (!resp.ok) return err(`Leverandørsiden svarte ${resp.status}`, 502);

  const html = await resp.text();
  const candidates = extractPrices(html);
  if (!candidates.length) {
    return json({ price: null, candidates: [], source: url.toString(),
      note: "Fant ingen pris i sideteksten – siden kan være endret eller krever JavaScript." });
  }
  // Pris-blokken viser som regel ordinær- og salgspris sammen øverst. Den
  // kunden faktisk betaler er den laveste av de to første treffene (salgspris ≤
  // ordinær), uavhengig av rekkefølge i markup.
  const price = Math.min(...candidates.slice(0, 2));
  return json({ price, candidates, source: url.toString() });
}
