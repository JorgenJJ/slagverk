// ── Slagverk Inventar – Worker-entrypunkt ──
// Erstatter Pages Functions (functions/api/*). Ett `fetch`-inngangspunkt med
// egen ruter for /api/*. Alt annet faller gjennom til static assets (PWA-en),
// som serveres direkte av plattformen via [assets]-bindingen i wrangler.toml.

import { err } from "./helpers.js";
import { login } from "./routes/login.js";
import * as inventory from "./routes/inventory.js";
import * as wishlist from "./routes/wishlist.js";
import { chat } from "./routes/chat.js";

// Rutetabell. `:id`-ruter fanger siste segment og sender det videre som params.id.
const ROUTES = [
  { method: "POST",   pattern: /^\/api\/login\/?$/,           handler: (req, env) => login(req, env) },

  { method: "GET",    pattern: /^\/api\/inventory\/?$/,       handler: (req, env) => inventory.list(req, env) },
  { method: "POST",   pattern: /^\/api\/inventory\/?$/,       handler: (req, env) => inventory.create(req, env) },
  { method: "PUT",    pattern: /^\/api\/inventory\/([^/]+)$/, handler: (req, env, m) => inventory.update(req, env, { id: decodeURIComponent(m[1]) }) },
  { method: "DELETE", pattern: /^\/api\/inventory\/([^/]+)$/, handler: (req, env, m) => inventory.remove(req, env, { id: decodeURIComponent(m[1]) }) },

  { method: "GET",    pattern: /^\/api\/wishlist\/?$/,        handler: (req, env) => wishlist.list(req, env) },
  { method: "POST",   pattern: /^\/api\/wishlist\/?$/,        handler: (req, env) => wishlist.create(req, env) },
  { method: "PUT",    pattern: /^\/api\/wishlist\/([^/]+)$/,  handler: (req, env, m) => wishlist.update(req, env, { id: decodeURIComponent(m[1]) }) },
  { method: "DELETE", pattern: /^\/api\/wishlist\/([^/]+)$/,  handler: (req, env, m) => wishlist.remove(req, env, { id: decodeURIComponent(m[1]) }) },

  { method: "POST",   pattern: /^\/api\/chat\/?$/,            handler: (req, env) => chat(req, env) },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      let methodMismatch = false;
      for (const r of ROUTES) {
        const m = url.pathname.match(r.pattern);
        if (!m) continue;
        if (r.method !== request.method) { methodMismatch = true; continue; }
        return r.handler(request, env, m);
      }
      return err(methodMismatch ? "Metode ikke tillatt" : "Ikke funnet", methodMismatch ? 405 : 404);
    }

    // Ikke et API-kall → la static-assets-laget svare (PWA-skall, SPA-fallback).
    return env.ASSETS.fetch(request);
  },
};
