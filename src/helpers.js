// Felles hjelpefunksjoner for API-et.
// Uendret fra Pages-versjonen (functions/api/_helpers.js) – samme logikk.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function err(message, status = 400) {
  return json({ error: message }, status);
}

// Felles-kode-beskyttelse. Klienten sender header `x-access-code`; vi sammenligner
// mot secret ACCESS_CODE. ALLE /api/-endepunkter krever dette (kalles først i hver
// handler), så ingen kan bruke endepunktene uten gyldig kode.
export function checkAuth(request, env) {
  const provided = request.headers.get("x-access-code") || "";
  const expected = env.ACCESS_CODE || "";
  // Fail closed: er ingen ACCESS_CODE konfigurert, NEKTES alt (appen er ikke åpen).
  // ACCESS_CODE må settes som secret på Worker-en før noe fungerer.
  if (!expected) return false;
  // Konstant-tid-ish sammenligning (lik mengde arbeid uansett lengde).
  let diff = provided.length ^ expected.length;
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i % (expected.length || 1));
  return diff === 0;
}

export function requireAuth(request, env) {
  if (!checkAuth(request, env)) return err("Feil eller manglende tilgangskode", 401);
  return null;
}

// Opake, kollisjonssikre ID-er. Prefiks beholdes kun for lesbarhet i logger/
// eksport – ID-er vises ikke i UI og skal ikke tolkes. crypto.randomUUID finnes
// i Workers-runtime; enkel fallback for eldre miljø.
export function newId(prefix) {
  const uuid = (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}
