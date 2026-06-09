import { json, err, requireAuth } from "../helpers.js";

// POST /api/chat  → AI-assistent (v2)
// Aktiveres ved å sette secret AI_API_KEY (Anthropic-nøkkel).
// Modellen får verktøy-beskrivelse av databasen og kan foreslå endringer
// som JSON; appen utfører dem etter brukerbekreftelse.
export async function chat(request, env) {
  const unauth = requireAuth(request, env);
  if (unauth) return unauth;

  if (!env.AI_API_KEY) {
    return json({
      reply: "AI-assistenten er ikke aktivert ennå. Sett en secret kalt AI_API_KEY i Cloudflare for å skru den på.",
      configured: false,
    });
  }

  let b;
  try { b = await request.json(); } catch { return err("Ugyldig JSON"); }
  const messages = b.messages || [];

  // Gi modellen kontekst om gjeldende beholdning
  const inv = (await env.DB.prepare("SELECT id,type,brand,category,status,quality,notes FROM inventory").all()).results;
  const wish = (await env.DB.prepare("SELECT id,type,category,priority,estimated_price,notes,budgeted FROM wishlist").all()).results;

  const system = `Du er assistent for slagverkseksjonen i Randaberg Musikkorps.
Du hjelper med å holde orden på inventar og innkjøpsplaner. Svar kort og på norsk.
Nåværende inventar (JSON): ${JSON.stringify(inv)}
Ønskeliste (JSON): ${JSON.stringify(wish)}
Når brukeren ber om å legge til/endre data, svar med et JSON-objekt i en kodeblokk
med formen {"action":"add_inventory|update_inventory|add_wishlist|...","data":{...}}
i tillegg til en kort forklaring, slik at appen kan bekrefte før den lagrer.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.AI_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system,
      messages,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return err("AI-tjenesten svarte med feil: " + t, 502);
  }
  const data = await resp.json();
  const reply = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
  return json({ reply, configured: true });
}
