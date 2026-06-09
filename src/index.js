// ── Slagverksoversikt – Worker-entrypunkt ──
// Ett `fetch`-inngangspunkt med egen ruter for /api/*. Alt annet faller gjennom
// til static assets (PWA-en), som serveres direkte av plattformen via
// [assets]-bindingen i wrangler.toml.

import { err } from "./helpers.js";
import { login } from "./routes/login.js";
import * as inventory from "./routes/inventory.js";
import * as wishlist from "./routes/wishlist.js";
import * as lists from "./routes/lists.js";
import * as brands from "./routes/brands.js";
import * as options from "./routes/options.js";
import { price } from "./routes/price.js";
import { search } from "./routes/search.js";
import { chat } from "./routes/chat.js";

const id = (m, i) => decodeURIComponent(m[i]);

// Rutetabell. Regex-grupper sendes videre som params.
const ROUTES = [
  { method: "POST",   pattern: /^\/api\/login\/?$/,           handler: (req, env) => login(req, env) },

  { method: "GET",    pattern: /^\/api\/inventory\/?$/,       handler: (req, env) => inventory.list(req, env) },
  { method: "POST",   pattern: /^\/api\/inventory\/?$/,       handler: (req, env) => inventory.create(req, env) },
  { method: "PUT",    pattern: /^\/api\/inventory\/([^/]+)$/, handler: (req, env, m) => inventory.update(req, env, { id: id(m, 1) }) },
  { method: "DELETE", pattern: /^\/api\/inventory\/([^/]+)$/, handler: (req, env, m) => inventory.remove(req, env, { id: id(m, 1) }) },

  // Mangel-alternativer + oppfyllelse (mer spesifikk enn /wishlist/:id) først.
  { method: "POST",   pattern: /^\/api\/wishlist\/([^/]+)\/options\/?$/, handler: (req, env, m) => options.create(req, env, { id: id(m, 1) }) },
  { method: "POST",   pattern: /^\/api\/wishlist\/([^/]+)\/fulfill\/?$/, handler: (req, env, m) => wishlist.fulfill(req, env, { id: id(m, 1) }) },
  { method: "GET",    pattern: /^\/api\/wishlist\/?$/,        handler: (req, env) => wishlist.list(req, env) },
  { method: "POST",   pattern: /^\/api\/wishlist\/?$/,        handler: (req, env) => wishlist.create(req, env) },
  { method: "PUT",    pattern: /^\/api\/wishlist\/([^/]+)$/,  handler: (req, env, m) => wishlist.update(req, env, { id: id(m, 1) }) },
  { method: "DELETE", pattern: /^\/api\/wishlist\/([^/]+)$/,  handler: (req, env, m) => wishlist.remove(req, env, { id: id(m, 1) }) },

  { method: "PUT",    pattern: /^\/api\/options\/([^/]+)$/,   handler: (req, env, m) => options.update(req, env, { id: id(m, 1) }) },
  { method: "DELETE", pattern: /^\/api\/options\/([^/]+)$/,   handler: (req, env, m) => options.remove(req, env, { id: id(m, 1) }) },

  { method: "GET",    pattern: /^\/api\/brands\/?$/,          handler: (req, env) => brands.list(req, env) },
  { method: "POST",   pattern: /^\/api\/brands\/?$/,          handler: (req, env) => brands.create(req, env) },
  { method: "PUT",    pattern: /^\/api\/brands\/([^/]+)$/,    handler: (req, env, m) => brands.update(req, env, { id: id(m, 1) }) },
  { method: "DELETE", pattern: /^\/api\/brands\/([^/]+)$/,    handler: (req, env, m) => brands.remove(req, env, { id: id(m, 1) }) },

  // Mer spesifikke lister-ruter (items) før de generelle.
  { method: "POST",   pattern: /^\/api\/lists\/([^/]+)\/fulfill\/?$/,      handler: (req, env, m) => lists.fulfill(req, env, { id: id(m, 1) }) },
  { method: "POST",   pattern: /^\/api\/lists\/([^/]+)\/items\/?$/,        handler: (req, env, m) => lists.addItem(req, env, { id: id(m, 1) }) },
  { method: "DELETE", pattern: /^\/api\/lists\/([^/]+)\/items\/([^/]+)$/,  handler: (req, env, m) => lists.removeItem(req, env, { id: id(m, 1), wishlistId: id(m, 2) }) },
  { method: "GET",    pattern: /^\/api\/lists\/?$/,           handler: (req, env) => lists.list(req, env) },
  { method: "POST",   pattern: /^\/api\/lists\/?$/,           handler: (req, env) => lists.create(req, env) },
  { method: "PUT",    pattern: /^\/api\/lists\/([^/]+)$/,     handler: (req, env, m) => lists.update(req, env, { id: id(m, 1) }) },
  { method: "DELETE", pattern: /^\/api\/lists\/([^/]+)$/,     handler: (req, env, m) => lists.remove(req, env, { id: id(m, 1) }) },

  { method: "POST",   pattern: /^\/api\/price\/?$/,           handler: (req, env) => price(req, env) },
  { method: "GET",    pattern: /^\/api\/search\/?$/,          handler: (req, env) => search(req, env) },
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
