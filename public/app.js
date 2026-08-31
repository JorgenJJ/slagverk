// ── Slagverksoversikt – frontend (buildless vanilla JS) ──
// Randaberg Musikkorps. Tema: «lagerhylle» (se styles.css).
// Konvensjoner for hele appen: se /CLAUDE.md i repoet.
//
// Struktur pr. fane: papir-header → oppsummeringsstripe → søk/filter →
// seksjoner med klebrig overskrift og rader. AI-bar og fanelinje ligger fast
// i bunnen. Skjemaer er ark som kommer opp fra bunnen (ikke bokser midt på).

const CATEGORIES = ["Trommer", "Melodisk", "Pauker", "Cymbaler", "Stativer", "Perkusjon", "Stikker og klubber"];
const BRAND_CATS = ["Generelt", ...CATEGORIES];
const PRIORITIES = ["høy", "middels", "lav"];
const STATUSES = ["ok", "redusert", "ødelagt"];
const QUALITIES = ["bra", "greit", "dårlig", "ukjent"];
const PRI_LABEL = { høy: "Høy", middels: "Middels", lav: "Lav" };
const STATUS_LABEL = { ok: "OK", redusert: "Redusert", ødelagt: "Ødelagt" };
const QUALITY_LABEL = { bra: "Bra", greit: "Greit", dårlig: "Dårlig", ukjent: "Ukjent" };
const STATUS_RANK = { ok: 3, redusert: 2, ødelagt: 1 };
const QUALITY_RANK = { bra: 4, greit: 3, dårlig: 2, ukjent: 0 };
// Faner (likeverdige, fyller bredden i bunnlinja). «Generér oversikt» er IKKE en
// fane, men en header-knapp ved siden av Logg ut (se render()).
const TABS = [["oversikt", "Oversikt"], ["mangler", "Mangler"], ["lister", "Innkjøp"], ["merker", "Merker"]];
// Tittel i headeren pr. fane. Undertittelen er ALLTID korpsnavnet – den er
// avsenderidentitet, ikke en beskrivelse av fanen.
const TAB_TITLE = {
  oversikt: "Slagverk",
  mangler: "Mangler",
  lister: "Innkjøp",
  merker: "Merker",
  generer: "Generér oversikt",
};
const ORG = "Randaberg Musikkorps";

const state = {
  code: localStorage.getItem("slagverk_code") || "",
  tab: "oversikt",
  inventory: [], wishlist: [], lists: [], brands: [],
  filters: { category: [], status: [], quality: [], brand: [] },
  q: "", searchFocus: false,
  filterSheet: false,
  expandedGroups: {}, expandedWish: {}, expandedNodes: {}, collapsedLists: {},
  retiredView: false, listArchive: false, exportMenu: null,
  ovMinStatus: "Alle", ovMinQuality: "Alle", genCustomize: false,
  chat: [], chatBusy: false, chatOpen: false, lastActions: [],
  modal: null,
};

const root = document.getElementById("root");
const fmt = (n) => (n || n === 0 ? Number(n).toLocaleString("nb-NO") + " kr" : "–");
const num = (n) => (n || n === 0 ? Number(n).toLocaleString("nb-NO") : "");
// Kort dato til desktop-kolonna «Endret» (f.eks. «4. aug.»).
const shortDate = (d) => { if (!d) return ""; const t = new Date(d); return isNaN(t) ? "" : t.toLocaleDateString("nb-NO", { day: "numeric", month: "short" }); };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byId = (arr, id) => arr.find((x) => x.id === id);
// Fjern vanlig markdown som ikke rendres i appen (sikkerhetsnett – modellen er
// også bedt om å skrive ren tekst).
const stripMd = (s) => String(s ?? "")
  .replace(/\*\*(.+?)\*\*/g, "$1")
  .replace(/__(.+?)__/g, "$1")
  .replace(/`([^`]+)`/g, "$1")
  .replace(/^\s{0,3}#{1,6}\s+/gm, "");

// Ekte Randaberg-logo med innebygd SVG-skjold som fallback.
function fallbackSVG(stroke) {
  return `<svg viewBox='0 0 48 48' width='100%' height='100%' fill='none'><path d='M24 3 6 8v17c0 11 8 18 18 22 10-4 18-11 18-22V8L24 3Z' fill='none' stroke='${stroke}' stroke-width='2.4' stroke-linejoin='round'/><circle cx='24' cy='22' r='8.2' fill='none' stroke='${stroke}' stroke-width='2.1'/><path d='M16.6 18.4 31.4 25.6M16.6 25.6 31.4 18.4' stroke='${stroke}' stroke-width='2.1' stroke-linecap='round'/></svg>`;
}
// variant: "full" (farge), "white" (hvite linjer – rød bakgrunn), "red" (røde linjer – lys bakgrunn).
function logo(size, variant = "red") {
  const src = variant === "white" ? "/randaberg-logo-white.png"
    : variant === "red" ? "/randaberg-logo-red.png" : "/randaberg-logo.png";
  const stroke = variant === "white" ? "#fff" : "#ba2e26";
  return `<span class="logo" style="width:${size}px;height:${size}px">
    <img src="${src}" alt="Randaberg Musikkorps" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
    <span class="logo-fb" style="display:none">${fallbackSVG(stroke)}</span>
  </span>`;
}

const ICON_DOC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>`;
const ICON_OUT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/></svg>`;

// ── API ──
async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-access-code": state.code, ...(opts.headers || {}) },
  });
  if (res.status === 401) { logout(); throw new Error("Ikke autorisert"); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Feil");
  return res.status === 204 ? null : res.json();
}
async function loadAll() {
  [state.inventory, state.wishlist, state.lists, state.brands] = await Promise.all([
    api("/inventory"), api("/wishlist"), api("/lists"), api("/brands"),
  ]);
  render();
}

// ── Auth ──
async function login(code) {
  state.code = code;
  await api("/login", { method: "POST" });
  localStorage.setItem("slagverk_code", code);
  await loadAll();
}
function logout() {
  state.code = ""; state.chatOpen = false;
  localStorage.removeItem("slagverk_code");
  render();
}

// ── Toast (med valgfri handling) ──
let toastTimer;
function toast(msg, action) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement("button"); b.textContent = action.label; b.onclick = () => { t.remove(); action.fn(); }; t.appendChild(b); }
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), action ? 7000 : 2600);
}

// ── Derived ──
const wish = (id) => byId(state.wishlist, id);
const inv = (id) => byId(state.inventory, id);
const optionPrices = (w) => (w.options || []).map((o) => o.price).filter((p) => p != null);
const effPrice = (w) => { const p = optionPrices(w); return p.length ? Math.min(...p) : (w.estimated_price || 0); };
// To linjer når det er et spenn (som i designet), én linje ellers.
function priceLines(w) {
  const p = optionPrices(w);
  if (p.length) {
    const mn = Math.min(...p), mx = Math.max(...p);
    return mn === mx ? [fmt(mn)] : [num(mn) + " –", fmt(mx)];
  }
  return [fmt(w.estimated_price)];
}
const priceDisplay = (w) => priceLines(w).join(" ");
// Et produkt (alternativ) på tvers av alle mangler. Liste-linjer refererer til disse.
const optionById = (oid) => { for (const w of state.wishlist) { const o = (w.options || []).find((x) => x.id === oid); if (o) return o; } return null; };
const optionName = (o) => (o ? ([o.brand, o.model, o.size].filter(Boolean).join(" ") || "Alternativ") : "");
const listSum = (l) => (l.items || []).reduce((a, it) => { const o = optionById(it.option_id); return a + (o && o.price != null ? o.price * (it.qty || 1) : 0); }, 0);
const manglerTotal = () => state.wishlist.reduce((a, w) => a + effPrice(w), 0);
const replacementFor = (invId) => state.wishlist.filter((w) => w.replaces_inventory_id === invId);
const listsWith = (wishId) => state.lists.filter((l) => (l.items || []).some((it) => it.wishlist_id === wishId));
const isErstatning = (w) => !!w.replaces_inventory_id;
// Et merke kan være foretrukket innen flere kategorier. Kanonisk form fra API-et er
// JSON-arrayen `categories`; `category` er speil av den første (eldre rader har bare
// den). Speiler brandCategories() i src/db.js – hold dem i synk.
function brandCats(b) {
  if (!b) return [];
  if (b.categories) {
    if (Array.isArray(b.categories)) return b.categories;
    try { const a = JSON.parse(b.categories); if (Array.isArray(a) && a.length) return a.map(String); } catch { /* faller tilbake */ }
  }
  return b.category ? [b.category] : [];
}
// ── Inventar-tre (komponent → deler) ──
const invChildren = (id) => state.inventory.filter((i) => i.parent_id === id && !i.retired_at).sort((a, b) => (a.category + a.type).localeCompare(b.category + b.type));
const invRoots = () => state.inventory.filter((i) => (!i.parent_id || !inv(i.parent_id)) && !i.retired_at)
  .sort((a, b) => (a.category + a.type).localeCompare(b.category + b.type));
function invSubtreeCount(id) { let n = 0; for (const c of invChildren(id)) n += 1 + invSubtreeCount(c.id); return n; }
function invDescendants(id) { const out = []; for (const c of invChildren(id)) { out.push(c.id); out.push(...invDescendants(c.id)); } return out; }
function invPath(i) { const out = []; let p = i.parent_id ? inv(i.parent_id) : null; let guard = 0; while (p && guard++ < 20) { out.unshift(p.type); p = p.parent_id ? inv(p.parent_id) : null; } return out; }

// ── Export ──
function invRows() {
  return state.inventory.map((i) => ({
    Type: i.type, Merke: i.brand, Kategori: i.category,
    Tilstand: STATUS_LABEL[i.status] || i.status, Kvalitet: i.quality, Merknader: i.notes,
  }));
}
function wishRows(items) {
  return items.map((w) => ({
    Type: w.type, Art: isErstatning(w) ? "Erstatning" : "Mangel", Kategori: w.category,
    Prioritet: PRI_LABEL[w.priority] || w.priority, "Est. pris": effPrice(w) || "",
    Erstatter: w.replaces_inventory_id ? (inv(w.replaces_inventory_id)?.type || "") : "",
    Alternativer: (w.options || []).length, Merknader: w.notes,
  }));
}
function exportExcelAll() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows()), "Inventar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wishRows(state.wishlist)), "Mangler");
  XLSX.writeFile(wb, "slagverk-inventar.xlsx");
  toast("Eksportert til Excel");
}
function downloadCSV(rows, filename) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}
function listRows(l) {
  return (l.items || []).map((it) => { const o = optionById(it.option_id); if (!o) return null; const w = wish(it.wishlist_id);
    return { produkt: optionName(o), mangel: w ? w.type : "", antall: it.qty || 1, pris: o.price || 0, sum: (o.price || 0) * (it.qty || 1), lenke: o.link || "" }; }).filter(Boolean);
}
// ── Excel-rapport: dedikert innkjøps-mal (tittel, pris pr. gjenstand, total) ──
function exportListExcel(l) {
  const rows = listRows(l);
  const total = rows.reduce((a, r) => a + r.sum, 0);
  const date = new Date().toLocaleDateString("nb-NO");
  const aoa = [
    ["Innkjøpsliste – " + l.name],
    ["Randaberg Musikkorps, slagverk · " + date],
    [],
    ["Produkt", "For mangel", "Antall", "Pris pr. stk", "Sum", "Lenke"],
    ...rows.map((r) => [r.produkt, r.mangel, r.antall, r.pris, r.sum, r.lenke]),
    [],
    ["", "", "", "", "Total", total],
  ];
  if (l.budget) { aoa.push(["", "", "", "", "Budsjett", l.budget]); aoa.push(["", "", "", "", "Gjenstår", l.budget - total]); }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 40 }, { wch: 24 }, { wch: 8 }, { wch: 13 }, { wch: 13 }, { wch: 42 }];
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }];
  for (let r = 0; r < aoa.length; r++) for (const c of [3, 4]) {
    const ref = XLSX.utils.encode_cell({ r, c }); if (ws[ref] && typeof ws[ref].v === "number") ws[ref].z = '#,##0" kr"';
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Innkjøp");
  XLSX.writeFile(wb, `innkjopsliste-${l.name.replace(/\s+/g, "-").toLowerCase()}.xlsx`);
  toast("Eksportert til Excel");
}
// ── Skriv ut / PDF: samme rapport-mal, gråtoner ──
function printList(l) {
  const rows = listRows(l);
  const total = rows.reduce((a, r) => a + r.sum, 0);
  const body = rows.map((r) => `<tr><td>${esc(r.produkt)}</td><td class="m">${esc(r.mangel)}</td><td class="r">${r.antall}</td><td class="r">${fmt(r.pris)}</td><td class="r">${fmt(r.sum)}</td></tr>`).join("");
  const foot = `<tr><td colspan="4" class="r">Total</td><td class="r">${fmt(total)}</td></tr>` +
    (l.budget ? `<tr><td colspan="4" class="r">Budsjett</td><td class="r">${fmt(l.budget)}</td></tr><tr><td colspan="4" class="r">Gjenstår</td><td class="r">${fmt(l.budget - total)}</td></tr>` : "");
  let area = document.getElementById("printarea");
  if (!area) { area = document.createElement("div"); area.id = "printarea"; document.body.appendChild(area); }
  area.innerHTML = `<h2>Innkjøpsliste – ${esc(l.name)}</h2>
    <div class="pmeta">Randaberg Musikkorps, slagverk · ${new Date().toLocaleDateString("nb-NO")}</div>
    <table><thead><tr><th>Produkt</th><th>For mangel</th><th class="r">Antall</th><th class="r">Pris pr. stk</th><th class="r">Sum</th></tr></thead>
      <tbody>${body || `<tr><td colspan="5">Ingen produkter i lista.</td></tr>`}</tbody>
      <tfoot>${foot}</tfoot></table>
    <div class="pfoot">Generert ${new Date().toLocaleDateString("nb-NO")} · Slagverksoversikt</div>`;
  document.body.classList.add("printing");
  // Klassen ryddes i render() – afterprint/timer er upålitelig på mobil.
  window.print();
}

// ── Mutations ──
async function saveInventory(item, isNew) {
  const payload = { ...item, parent_id: item.parent_id || null };
  if (isNew) await api("/inventory", { method: "POST", body: JSON.stringify(payload) });
  else await api("/inventory/" + item.id, { method: "PUT", body: JSON.stringify(payload) });
  state.modal = null; await loadAll(); toast("Lagret");
}
async function deleteInventory(id) {
  const n = invSubtreeCount(id);
  if (n > 0 && !confirm(`Dette sletter også ${n} underdel${n > 1 ? "er" : ""}. Fortsette?`)) return;
  await api("/inventory/" + id, { method: "DELETE" }); state.modal = null; await loadAll(); toast("Slettet");
}
// ── Oppfyllelse (kjøpt) + arkivering ──
async function fulfillWish(wishId, optionId) {
  if (!confirm("Marker som kjøpt? Produktet legges i inventar og mangelen fjernes.")) return;
  await api(`/wishlist/${wishId}/fulfill`, { method: "POST", body: JSON.stringify({ option_id: optionId || null }) });
  await loadAll(); toast("Kjøpt – lagt i inventar");
}
async function fulfillListBuy(listId) {
  const l = byId(state.lists, listId); const n = (l?.items || []).length;
  if (!confirm(`Marker «${l ? l.name : ""}» som kjøpt?\n${n} vare(r) legges i inventar, manglene fjernes, og lista arkiveres.`)) return;
  const r = await api(`/lists/${listId}/fulfill`, { method: "POST" });
  await loadAll(); toast(`Kjøpt – ${r.count} lagt i inventar`);
}
async function setRetired(id, retired) {
  await api(`/inventory/${id}`, { method: "PUT", body: JSON.stringify({ retired_at: retired ? new Date().toISOString() : null }) });
  await loadAll(); toast(retired ? "Merket utgått" : "Gjenopprettet");
}
async function setArchived(id, archived) {
  await api(`/lists/${id}`, { method: "PUT", body: JSON.stringify({ archived_at: archived ? new Date().toISOString() : null }) });
  await loadAll(); toast(archived ? "Arkivert" : "Gjenopprettet");
}
async function saveWish(item, isNew) {
  const payload = { ...item, estimated_price: item.estimated_price === "" ? null : Number(item.estimated_price) };
  if (isNew) await api("/wishlist", { method: "POST", body: JSON.stringify(payload) });
  else await api("/wishlist/" + item.id, { method: "PUT", body: JSON.stringify(payload) });
  state.modal = null; await loadAll(); toast("Lagret");
}
async function deleteWish(id) { await api("/wishlist/" + id, { method: "DELETE" }); state.modal = null; await loadAll(); toast("Slettet"); }

async function createList(item) { await api("/lists", { method: "POST", body: JSON.stringify(item) }); state.modal = null; await loadAll(); toast("Liste opprettet"); }
async function saveList(item) { await api("/lists/" + item.id, { method: "PUT", body: JSON.stringify(item) }); state.modal = null; await loadAll(); toast("Lagret"); }
async function deleteList(id) { await api("/lists/" + id, { method: "DELETE" }); state.modal = null; await loadAll(); toast("Liste slettet"); }
async function toggleListItem(listId, optionId, on) {
  if (on) await api(`/lists/${listId}/items`, { method: "POST", body: JSON.stringify({ option_id: optionId }) });
  else await api(`/lists/${listId}/items/${optionId}`, { method: "DELETE" });
  await loadAll();
}
async function addToListChosen(listId, optionId) {
  const l = byId(state.lists, listId);
  if (l && (l.items || []).some((it) => it.option_id === optionId)) { state.modal = null; render(); return toast("Ligger allerede i listen"); }
  await api(`/lists/${listId}/items`, { method: "POST", body: JSON.stringify({ option_id: optionId }) });
  state.modal = null; await loadAll(); toast("Lagt til i listen");
}

async function saveBrand(item, isNew) {
  if (isNew) await api("/brands", { method: "POST", body: JSON.stringify(item) });
  else await api("/brands/" + item.id, { method: "PUT", body: JSON.stringify(item) });
  state.modal = null; await loadAll(); toast("Lagret");
}
async function deleteBrand(id) { await api("/brands/" + id, { method: "DELETE" }); state.modal = null; await loadAll(); toast("Slettet"); }

async function saveOption(wishId, item, isNew) {
  const payload = { ...item, price: item.price === "" ? null : Number(item.price) };
  if (isNew) await api(`/wishlist/${wishId}/options`, { method: "POST", body: JSON.stringify(payload) });
  else await api(`/options/${item.id}`, { method: "PUT", body: JSON.stringify(payload) });
  state.modal = null; await loadAll(); toast("Alternativ lagret");
}
async function deleteOption(id) { await api("/options/" + id, { method: "DELETE" }); state.modal = null; await loadAll(); toast("Alternativ slettet"); }

async function fetchPriceUrl(url, applyFn) {
  toast("Henter pris …");
  try {
    const r = await api("/price", { method: "POST", body: JSON.stringify({ url }) });
    if (!r.price) return toast("Fant ingen pris på siden");
    await applyFn(r.price); await loadAll(); toast(`Pris oppdatert: ${fmt(r.price)}`);
  } catch (e) { toast("Feil: " + e.message); }
}
async function fetchAllPrices() {
  const targets = [];
  state.wishlist.forEach((w) => {
    (w.options || []).forEach((o) => { if (o.link) targets.push({ url: o.link, apply: (p) => api(`/options/${o.id}`, { method: "PUT", body: JSON.stringify({ price: p }) }) }); });
    if (w.link && !(w.options || []).length) targets.push({ url: w.link, apply: (p) => api(`/wishlist/${w.id}`, { method: "PUT", body: JSON.stringify({ estimated_price: p }) }) });
  });
  if (!targets.length) return toast("Ingen lenker å hente fra");
  toast(`Henter ${targets.length} priser …`);
  let ok = 0;
  for (const t of targets) { try { const r = await api("/price", { method: "POST", body: JSON.stringify({ url: t.url }) }); if (r.price) { await t.apply(r.price); ok++; } } catch { /* hopp */ } }
  await loadAll(); toast(`Oppdaterte ${ok} av ${targets.length} priser`);
}

// ── Chat ──
async function sendChat(text) {
  if (!text.trim() || state.chatBusy) return;
  state.chat.push({ role: "user", content: text });
  state.chatBusy = true; render();
  try {
    const r = await api("/chat", { method: "POST", body: JSON.stringify({ messages: state.chat }) });
    state.chat.push({ role: "assistant", content: r.reply });
    if (r.actions && r.actions.length) {
      state.lastActions = r.actions; await loadAll(); state.chatBusy = false; render();
      toast(`AI gjorde ${r.actions.length} endring${r.actions.length > 1 ? "er" : ""}`, { label: "Angre", fn: undoActions });
      return;
    }
  } catch (e) { state.chat.push({ role: "assistant", content: "Feil: " + e.message }); }
  state.chatBusy = false; render();
}
async function undoActions() {
  const acts = [...state.lastActions].reverse(); state.lastActions = [];
  const COLL = { inventory: "/inventory", wishlist: "/wishlist", list: "/lists", brand: "/brands", option: "/options" };
  for (const a of acts) {
    try {
      if (a.kind === "list_item") {
        if (a.op === "add") await api(`/lists/${a.list_id}/items/${a.option_id}`, { method: "DELETE" });
        else await api(`/lists/${a.list_id}/items`, { method: "POST", body: JSON.stringify({ option_id: a.option_id }) });
        continue;
      }
      const coll = COLL[a.kind];
      if (a.op === "create") await api(`${coll}/${a.id}`, { method: "DELETE" });
      else if (a.op === "update") await api(`${coll}/${a.id}`, { method: "PUT", body: JSON.stringify(a.before) });
      else if (a.op === "delete") {
        if (a.kind === "option") await api(`/wishlist/${a.before.wishlist_id}/options`, { method: "POST", body: JSON.stringify(a.before) });
        else await api(coll, { method: "POST", body: JSON.stringify(a.before) });
      }
    } catch { /* fortsett */ }
  }
  await loadAll(); toast("Angret");
}

// ── Sidekolonne (kun desktop ≥1024px – skjult med CSS på mobil) ──────
// Faner + filtre bor her på stor skjerm (ingen egne filterark), jf. docs/design.
function sidebarFilters() {
  if (state.tab !== "oversikt") return "";
  const all = state.inventory.filter((i) => !i.retired_at);
  const cnt = (fn) => all.filter(fn).length;
  const grp = (label, key, opts) => `<div class="sgrp"><div class="slabel">${label}</div>${opts.map((o) => {
    const on = state.filters[key].includes(o.val);
    return `<div class="sfilter ${on ? "on" : ""}" data-facet="${key}|${esc(o.val)}">
      <span class="cb">${on ? "✓" : ""}</span><span class="l">${esc(o.label)}</span><span class="n">${o.n}</span></div>`;
  }).join("")}</div>`;
  return `<div class="sfilters">
    ${grp("Tilstand", "status", STATUSES.map((s) => ({ val: s, label: STATUS_LABEL[s], n: cnt((i) => i.status === s) })))}
    ${grp("Kategori", "category", CATEGORIES.map((c) => ({ val: c, label: c, n: cnt((i) => i.category === c) })).filter((o) => o.n))}
    ${grp("Kvalitet", "quality", QUALITIES.map((qq) => ({ val: qq, label: QUALITY_LABEL[qq], n: cnt((i) => i.quality === qq) })).filter((o) => o.n))}
  </div>`;
}
function renderSidebar() {
  const counts = {
    oversikt: state.inventory.filter((i) => !i.retired_at).length,
    mangler: state.wishlist.length,
    lister: state.lists.filter((l) => !l.archived_at).length,
    merker: state.brands.length,
  };
  return `<aside class="side">
    <div class="sbrand">${logo(34, "red")}<div><div class="t">Slagverk</div><div class="s">Randaberg MK</div></div></div>
    <nav class="snav">${[
      ["oversikt", "Oversikt", `${counts.oversikt}`],
      ["mangler", "Mangler og innkjøp", `${counts.mangler} · ${counts.lister}`],
      ["merker", "Merker", `${counts.merker}`],
    ].map(([k, l, n]) => { const on = state.tab === k || (k === "mangler" && state.tab === "lister");
      return `<div class="sitem ${on ? "on" : ""}" data-tab="${k}"><span class="bar"></span>${l}<span class="sp"></span><span class="n">${n}</span></div>`; }).join("")}</nav>
    ${sidebarFilters()}
    <div class="sflex"></div>
    <div class="sfoot">
      <div class="slink ${state.tab === "generer" ? "on" : ""}" data-tab="generer">⎙ Generér oversikt</div>
      <div class="slink" data-act="export-all">↓ Eksporter til Excel</div>
      <div class="slink" data-act="logout">⎋ Logg ut</div>
    </div>
  </aside>`;
}

// ── Render ──
let prevTab = null;
let swipeIn = 0;   // 1 = ny fane skled inn fra høyre (neste), -1 = fra venstre
function render() {
  if (!state.code) { prevTab = null; return renderLogin(); }
  document.body.classList.remove("printing");
  const scrollY = window.scrollY;
  const tabChanged = prevTab !== state.tab;
  prevTab = state.tab;
  const title = isSplit() && (state.tab === "mangler" || state.tab === "lister")
    ? "Mangler og innkjøp" : TAB_TITLE[state.tab] || TAB_TITLE.oversikt;
  root.innerHTML = `
    <div class="shell">
    ${renderSidebar()}
    <div class="content">
    <header><div class="appbar">
      ${logo(32, "red")}
      <div class="titles"><h1>${esc(title)}</h1><small>${esc(ORG)}</small></div>
      <div class="hactions">
        <button class="hbtn ${state.tab === "generer" ? "active" : ""}" data-tab="generer" title="Generér oversikt (PDF til andre korps)" aria-label="Generér oversikt">${ICON_DOC}</button>
        <button class="hbtn" data-act="logout" title="Logg ut" aria-label="Logg ut">${ICON_OUT}</button>
      </div>
    </div></header>
    <main>${
      state.tab === "oversikt" ? viewOversikt()
      : state.tab === "mangler" || state.tab === "lister" ? viewSplit()
      : state.tab === "merker" ? viewMerker()
      : viewGenerer()
    }</main>
    </div>
    </div>
    ${renderBottom()}
    ${state.modal ? renderModal() : ""}
    ${state.filterSheet ? renderFilterSheet() : ""}
  `;
  const mainEl = root.querySelector("main");
  if (swipeIn && mainEl) {
    const from = swipeIn === 1 ? window.innerWidth : -window.innerWidth;
    mainEl.style.transition = "none";
    mainEl.style.transform = `translateX(${from}px)`;
    mainEl.style.opacity = "0";
    requestAnimationFrame(() => {
      mainEl.style.transition = "transform .2s ease, opacity .2s ease";
      mainEl.style.transform = "translateX(0)";
      mainEl.style.opacity = "1";
    });
    swipeIn = 0;
  } else if (tabChanged && mainEl) {
    mainEl.classList.add("view-enter");
  }
  wire();
  if (!tabChanged) window.scrollTo(0, scrollY);
}

function renderLogin() {
  root.innerHTML = `
    <div class="login-wrap"><div class="login-card">
      ${logo(64, "red")}
      <h1>Slagverksoversikt</h1>
      <p>Randaberg Musikkorps</p>
      <div class="field"><label>Tilgangskode</label><input id="code" type="password" placeholder="••••••" autofocus /></div>
      <button class="btn" id="loginBtn" style="width:100%">Logg inn</button>
      <p id="loginErr" style="color:var(--bad);margin-top:14px;display:none;text-transform:none;letter-spacing:0">Feil kode</p>
    </div></div>`;
  const go = async () => { try { await login(document.getElementById("code").value); } catch { document.getElementById("loginErr").style.display = "block"; } };
  document.getElementById("loginBtn").onclick = go;
  document.getElementById("code").onkeydown = (e) => { if (e.key === "Enter") go(); };
}

// ── Felles byggeklosser ─────────────────────────────────────────────
const pillStatus = (s) => `<span class="pill ${s}">${STATUS_LABEL[s] || esc(s)}</span>`;
// Kvalitet: nøytral tre-trinns måler med ordet under (aldri forvekslet med tilstand).
function qmeter(q) {
  const n = { bra: 3, greit: 2, dårlig: 1, ukjent: 1 }[q] ?? 0;
  const unk = q === "ukjent";
  let bars = "";
  for (let k = 0; k < 3; k++) bars += `<i class="${k < n ? (unk ? "unk" : "on") : ""}"></i>`;
  return `<div class="qm">${bars}</div><span class="qlabel">${QUALITY_LABEL[q] || esc(q)}</span>`;
}
function searchBar(placeholder, extra) {
  return `<div class="seek"><div class="line">
    <div class="search"><span>⌕</span><input id="searchInput" type="search" placeholder="${esc(placeholder)}" value="${esc(state.q)}" /></div>
    ${extra || ""}
  </div>${activeFilterChips()}</div>`;
}
function activeFilterChips() {
  const chips = [];
  const push = (key, val, label) => chips.push(`<span class="fchip" data-rmfilter="${key}|${esc(val)}">${esc(label)} ✕</span>`);
  state.filters.category.forEach((c) => push("category", c, c));
  state.filters.status.forEach((s) => push("status", s, STATUS_LABEL[s]));
  state.filters.quality.forEach((q) => push("quality", q, QUALITY_LABEL[q]));
  state.filters.brand.forEach((b) => push("brand", b, b || "(uten merke)"));
  if (!chips.length) return "";
  return `<div class="activefilters">${chips.join("")}<span class="act" data-act="clear-filters">Nullstill</span></div>`;
}
const anyFilter = () => Object.values(state.filters).some((a) => a.length);
const activeFilterCount = () => Object.values(state.filters).reduce((a, x) => a + x.length, 0);
const statActive = (facet, val) => state.filters[facet].length === 1 && state.filters[facet][0] === val;
function brandOptions() {
  const set = new Set(state.inventory.map((i) => i.brand || ""));
  return [...set].sort((a, b) => a.localeCompare(b)).map((b) => ({ val: b, label: b || "(uten merke)" }));
}
function passesFilters(i) {
  const f = state.filters;
  return (!f.category.length || f.category.includes(i.category))
    && (!f.status.length || f.status.includes(i.status))
    && (!f.quality.length || f.quality.includes(i.quality))
    && (!f.brand.length || f.brand.includes(i.brand || ""));
}
const hit = (...vals) => { const q = state.q.trim().toLowerCase(); return !q || vals.some((v) => String(v ?? "").toLowerCase().includes(q)); };

function renderFilterSheet() {
  const group = (key, label, opts) => `<div class="fset"><div class="leg">${label}</div>
    <div class="chips">${opts.map((o) => `<span class="chip ${state.filters[key].includes(o.val) ? "on" : ""}" data-facet="${key}|${esc(o.val)}">${esc(o.label)}</span>`).join("")}</div></div>`;
  return `<div class="sheet-bg" data-act="close-filtersheet"><div class="sheet" data-stop>
    <div class="grab"></div>
    <div class="shead"><div class="t"><h3>Filtre</h3><div class="sub" data-filtercount>${activeFilterCount()} aktive</div></div>
      <button class="x" data-act="close-filtersheet">✕</button></div>
    <div class="sbody">
      ${group("category", "Kategori", CATEGORIES.map((c) => ({ val: c, label: c })))}
      ${group("status", "Tilstand", STATUSES.map((s) => ({ val: s, label: STATUS_LABEL[s] })))}
      ${group("quality", "Kvalitet", QUALITIES.map((q) => ({ val: q, label: QUALITY_LABEL[q] })))}
      ${group("brand", "Merke", brandOptions())}
    </div>
    <div class="sfoot">${anyFilter() ? `<button class="btn danger" data-act="clear-filters">Nullstill</button>` : ""}
      <span class="spacer"></span><button class="btn" data-act="close-filtersheet">Ferdig</button></div>
  </div></div>`;
}

// ── Oversikt ─────────────────────────────────────────────────────────
function groupKey(i) { return [i.type, i.brand, i.model, i.size, i.category, i.status, i.quality, i.notes].join(""); }
const invSub = (i) => [i.brand, i.model, i.size, i.notes].filter(Boolean).join(" · ");
function invReplTag(i) {
  const r = replacementFor(i.id);
  return r.length ? `<span class="tag repl" data-goto-wish="${esc(r[0].id)}" title="Planlagt erstatning">↪ Erstatning planlagt</span>` : "";
}
function invRow(i, opts = {}) {
  const { caret = "", count = "", child = false, acts = "" } = opts;
  const tags = [invReplTag(i), acts].filter(Boolean).join("");
  const attr = opts.attr || `data-edit-inv="${i.id}"`;
  const path = opts.path && invPath(i).length ? invPath(i).join(" › ") + " › " : "";
  const sub = path + invSub(i);
  const bm = [i.brand, i.model, i.size].filter(Boolean).join(" ");
  return `<div class="row st-${i.status} click deskcols ${child ? "child" : ""}" ${attr}>
    <div class="main">
      <div class="title">${caret}${esc(i.type)}${count}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
      ${tags ? `<div class="tags">${tags}</div>` : ""}
    </div>
    <span class="dcell bm">${esc(bm) || "—"}</span>
    <div class="col-status">${pillStatus(i.status)}</div>
    <div class="col-quality">${qmeter(i.quality)}</div>
    <span class="dcell notes">${esc(i.notes) || "—"}</span>
    <span class="dcell date">${shortDate(i.updated_at)}</span>
  </div>`;
}
// Tre-rader: komponent med deler er utvidbar; like blad-søsken grupperes ×N.
function invTree(siblings) {
  let html = ""; const seen = new Set();
  for (const i of siblings) {
    const kids = invChildren(i.id);
    if (kids.length) {
      const open = !!state.expandedNodes[i.id];
      html += invRow(i, {
        attr: `data-togglenode="${i.id}"`,
        caret: `<span class="caret">${open ? "▾" : "▸"}</span> `,
        count: ` <span class="count">${kids.length} deler</span>`,
        acts: `<span class="act" data-add-child="${i.id}">+ Del</span><span class="act" data-edit-inv="${i.id}">Rediger</span>`,
      });
      if (open) html += `<div class="expand">${invTree(kids)}</div>`;
    } else {
      const k = groupKey(i); if (seen.has(k)) continue; seen.add(k);
      const grp = siblings.filter((x) => !invChildren(x.id).length && groupKey(x) === k);
      if (grp.length === 1) { html += invRow(i); continue; }
      const gk = (i.parent_id || "") + "|" + k; const open = !!state.expandedGroups[gk];
      html += invRow(i, {
        attr: `data-togglegroup="${encodeURIComponent(gk)}"`,
        caret: `<span class="caret">${open ? "▾" : "▸"}</span> `,
        count: ` <span class="count">×${grp.length}</span>`,
      });
      if (open) html += grp.map((it) => invRow(it, { child: true })).join("");
    }
  }
  return html;
}
function viewOversikt() {
  const all = state.inventory.filter((i) => !i.retired_at);
  const retired = state.inventory.filter((i) => i.retired_at);
  if (state.retiredView) return viewRetired(retired);
  const s = {
    total: all.length,
    ok: all.filter((i) => i.status === "ok").length,
    redusert: all.filter((i) => i.status === "redusert").length,
    ødelagt: all.filter((i) => i.status === "ødelagt").length,
  };
  const flat = anyFilter() || state.q.trim();
  let sections = [];
  if (flat) {
    const filtered = all.filter((i) => passesFilters(i) && hit(i.type, i.brand, i.model, i.size, i.notes, i.category));
    sections = CATEGORIES.map((c) => ({ cat: c, items: filtered.filter((i) => i.category === c) })).filter((x) => x.items.length);
  } else {
    const roots = invRoots();
    sections = CATEGORIES.map((c) => ({ cat: c, items: roots.filter((i) => i.category === c) })).filter((x) => x.items.length);
  }
  const body = sections.map((sec) => `
    <div class="sec cols"><span class="t">${esc(sec.cat)} <span class="n">${sec.items.length}</span></span>
      <span class="colhead dcell bm">Merke og modell</span>
      <span class="colhead status">Tilstand</span><span class="colhead quality">Kvalitet</span>
      <span class="colhead dcell notes">Merknad</span><span class="colhead dcell date">Endret</span></div>
    ${flat ? sec.items.map((i) => invRow(i, { path: true })).join("") : invTree(sec.items)}`).join("");

  return `
    <div class="summary">
      <div class="top">
        <div class="big">${s.total} <span>enheter</span></div>
        <div class="colhead">Tilstand</div>
      </div>
      <div class="meterbar">
        <i style="flex:${s.ok || 0};background:var(--ok)"></i>
        <i style="flex:${s.redusert || 0};background:var(--warn)"></i>
        <i style="flex:${s.ødelagt || 0};background:var(--red)"></i>
      </div>
      <div class="legend">
        <span data-stat="status:ok" class="${statActive("status", "ok") ? "on" : ""}"><b style="color:var(--ok)">${s.ok}</b> OK</span>
        <span data-stat="status:redusert" class="${statActive("status", "redusert") ? "on" : ""}"><b style="color:var(--warn-ink)">${s.redusert}</b> redusert</span>
        <span data-stat="status:ødelagt" class="${statActive("status", "ødelagt") ? "on" : ""}"><b style="color:var(--red)">${s.ødelagt}</b> ødelagt</span>
      </div>
    </div>
    ${searchBar("Søk i utstyr", `
      <div class="fbtn" data-act="open-filtersheet">Filtre${activeFilterCount() ? ` <span class="n">${activeFilterCount()}</span>` : ""}</div>
      <div class="add" data-act="add-inv">+</div>`)}
    <div class="panel">${body || `<div class="muted-note">Ingen treff.</div>`}</div>
    <div class="pad" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <button class="btn ghost sm" data-act="export-all">↓ Eksporter</button>
      ${retired.length ? `<button class="btn ghost sm" data-act="toggle-retired">⌫ Utgått utstyr (${retired.length})</button>` : ""}
    </div>`;
}
// Utgått/erstattet utstyr (bevart, men ute av oversikten).
function viewRetired(retired) {
  return `
    <div class="pad" style="padding-top:16px">
      <button class="btn ghost sm" data-act="toggle-retired">← Tilbake til oversikt</button>
      <p style="color:var(--muted);font-size:13px">Utstyr som er erstattet av nyere innkjøp. Tas ikke med i oversikten, men er bevart.</p>
    </div>
    <div class="panel">
      <div class="sec"><span class="t">Utgått / erstattet <span class="n">${retired.length}</span></span></div>
      ${retired.length ? retired.map((i) => `<div class="row dim">
        <div class="main"><div class="title">${esc(i.type)}</div>
          ${invSub(i) ? `<div class="sub">${esc(invSub(i))}</div>` : ""}
          <div class="tags"><span class="act" data-unretire="${i.id}">↩ Gjenopprett</span><span class="act red" data-del-inv="${i.id}">Slett</span></div>
        </div></div>`).join("") : `<div class="muted-note">Ingenting utgått.</div>`}
    </div>`;
}

// ── Delt visning (desktop): Mangler + Innkjøp side om side ───────────
// Begge kolonner rendres alltid; under 1000px skjuler CSS den inaktive
// (mobil uendret), over vises begge. Ingen id-kollisjon: kun viewMangler
// har #searchInput, og wire() binder via querySelectorAll.
const isSplit = () => matchMedia("(min-width: 1024px)").matches;
let dragPayload = null;
function viewSplit() {
  return `<div class="split">
    <section class="split-col ${state.tab === "mangler" ? "active" : ""}">${viewMangler()}</section>
    <section class="split-col ${state.tab === "lister" ? "active" : ""}">${viewLister()}</section>
  </div>`;
}

// ── Mangler ──────────────────────────────────────────────────────────
function optionBlock(w, o) {
  return `<div class="opt" ${isSplit() ? `draggable="true" data-drag-opt="${o.id}"` : ""}>
    <div class="head">
      <div class="m"><b>${esc(o.brand) || "Alternativ"}</b> ${esc(o.model)} ${o.size ? `<span class="mono">${esc(o.size)}</span>` : ""}
        ${o.info ? `<div class="info">${esc(o.info)}</div>` : ""}</div>
      <div class="price">${fmt(o.price)}</div>
    </div>
    <div class="acts">
      <button class="btn brass sm" data-addtolist="${o.id}">+ Til liste</button>
      <button class="btn ghost sm" data-buyopt="${w.id}|${o.id}">✓ Kjøpt</button>
      ${o.link ? `<a class="act red" href="${esc(o.link)}" target="_blank" rel="noreferrer" data-stoplink>Produkt ↗</a>` : ""}
      <span class="act" data-edit-opt="${w.id}|${o.id}">Rediger</span>
      ${o.link ? `<span class="act" data-priceopt="${o.id}|${esc(o.link)}">⟳ Pris</span>` : ""}
    </div>
  </div>`;
}
function wishExpand(w) {
  const opts = w.options || [];
  return `<div class="expand pri-${w.priority}">
    ${opts.length ? opts.map((o) => optionBlock(w, o)).join("")
      : `<div class="opt-empty">Ingen alternativer ennå. Legg til et konkret produkt for å kunne kjøpe / legge i liste.</div>`}
    <div class="rowacts">
      <button class="btn ghost sm" data-edit-wish="${w.id}">✎ Rediger mangel</button>
      <button class="btn ghost sm" data-addopt="${w.id}">+ Alternativ</button>
      ${opts.length ? "" : `<button class="btn ghost sm" data-buywish="${w.id}">✓ Marker kjøpt</button>`}
    </div>
  </div>`;
}
function viewMangler() {
  const items = state.wishlist.filter((w) => hit(w.type, w.category, w.notes));
  const byPri = (p) => items.filter((w) => w.priority === p);
  const cnt = { høy: byPri("høy").length, middels: byPri("middels").length, lav: byPri("lav").length };
  const total = state.wishlist.reduce((a, w) => a + effPrice(w), 0);

  const body = PRIORITIES.map((pri) => {
    const list = byPri(pri);
    if (!list.length) return "";
    return `<div class="sec cols pri-${pri}"><span class="t">${PRI_LABEL[pri]} prioritet <span class="n">${list.length}</span></span>
        <span class="colhead dcell wcat">Kategori</span><span class="colhead dcell walt">Alternativer</span>
        <span class="colhead price">Est. pris</span></div>
      ${list.map((w) => {
        const open = !!state.expandedWish[w.id];
        const n = (w.options || []).length;
        const lines = priceLines(w);
        const tags = [
          isErstatning(w)
            ? `<span class="tag erstatning" data-goto-inv="${esc(w.replaces_inventory_id)}">Erstatning</span>`
            : `<span class="tag">Mangel</span>`,
          ...listsWith(w.id).map((l) => `<span class="tag liste" data-goto-list="${esc(l.id)}">I liste: ${esc(l.name)}</span>`),
          open ? "" : `<span class="act" data-edit-wish="${w.id}">Rediger</span>`,
        ].filter(Boolean).join("");
        return `<div class="row pri-${pri} click deskcols" data-togglewish="${w.id}" ${isSplit() && n ? `draggable="true" data-drag-wish="${w.id}"` : ""}>
          <div class="main">
            <div class="title"><span class="caret">${open ? "▾" : "▸"}</span> ${esc(w.type)}</div>
            <div class="sub">${esc(w.category)}${n ? ` · ${n} alternativ${n > 1 ? "er" : ""}` : ""}</div>
            <div class="tags">${tags}</div>
          </div>
          <span class="dcell wcat">${esc(w.category)}</span>
          <span class="dcell walt">${n ? `${n} alternativ${n > 1 ? "er" : ""}` : "—"}</span>
          <div class="col-price">${lines.map((l) => `<div class="price">${l}</div>`).join("")}</div>
        </div>
        ${open ? wishExpand(w) : ""}`;
      }).join("")}`;
  }).join("");

  return `
    <div class="summary">
      <div class="top">
        <div class="big">${state.wishlist.length} <span>mangler</span></div>
        <div class="money">${fmt(total)}</div>
      </div>
      <div class="meterbar">
        <i style="flex:${cnt.høy || 0};background:var(--red)"></i>
        <i style="flex:${cnt.middels || 0};background:var(--warn)"></i>
        <i style="flex:${cnt.lav || 0};background:var(--lav)"></i>
      </div>
      <div class="legend">
        <span><b style="color:var(--red)">${cnt.høy}</b> høy</span>
        <span><b style="color:var(--warn-ink)">${cnt.middels}</b> middels</span>
        <span><b style="color:var(--faint-2)">${cnt.lav}</b> lav</span>
      </div>
    </div>
    ${searchBar("Søk i mangler", `
      <div class="gbtn" data-act="fetch-prices" title="Henter priser fra lenker">⟳ Priser</div>
      <div class="add" data-act="add-wish">+</div>`)}
    <div class="panel">${body || `<div class="muted-note">Ingen mangler registrert.</div>`}</div>`;
}

// ── Innkjøp ──────────────────────────────────────────────────────────
function viewLister() {
  const active = state.lists.filter((l) => !l.archived_at);
  const archived = state.lists.filter((l) => l.archived_at);
  if (state.listArchive) return viewListArchive(archived);
  const varer = active.reduce((a, l) => a + (l.items || []).length, 0);
  const sum = active.reduce((a, l) => a + listSum(l), 0);
  return `
    <div class="summary row-style">
      <div style="flex:1">
        <div class="eyebrow">${active.length} liste${active.length === 1 ? "" : "r"} · ${varer} varer</div>
        <div class="money">${fmt(sum)}</div>
      </div>
      <button class="btn" data-act="add-list">+ Ny liste</button>
    </div>
    ${state.exportMenu ? `<div class="pop-catcher" data-act="close-export"></div>` : ""}
    <div class="panel">${active.length ? active.map(listSection).join("") : `<div class="muted-note">Ingen aktive lister. Lag én, og legg inn produktene du vil kjøpe sammen.</div>`}</div>
    <div class="pad" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      ${archived.length ? `<button class="btn ghost sm" data-act="toggle-archive">▤ Kjøpt / arkiv (${archived.length})</button>` : ""}
    </div>
    <div class="grand"><div class="label">Sum alle mangler (overordnet)</div><div class="val">${fmt(manglerTotal())}</div></div>`;
}
function listSection(l) {
  const sum = listSum(l);
  const items = (l.items || []).map((it) => ({ it, o: optionById(it.option_id), w: wish(it.wishlist_id) })).filter((x) => x.o);
  const pct = l.budget ? Math.min(100, (sum / l.budget) * 100) : 0;
  const over = l.budget ? sum > l.budget : false;
  const closed = !!state.collapsedLists[l.id];
  // Kollapset kort: kun headeren, med nøkkelinfo (antall varer, sum, ev. budsjettrest).
  if (closed) {
    return `<div class="listbox" data-droplist="${l.id}">
      <div class="sec list click" data-togglelist="${l.id}">
        <span class="t"><span class="caret">▸</span> ${esc(l.name)} <span class="n">${items.length}</span></span>
        <span class="linfo">${items.length} vare${items.length === 1 ? "" : "r"}${l.budget ? ` · ${over ? "over budsjett med " + fmt(sum - l.budget) : fmt(l.budget - sum) + " igjen"}` : ""}</span>
        <span class="sum">${fmt(sum)}</span>
        <span class="act" data-edit-list="${l.id}">✎</span></div>
    </div>`;
  }
  return `<div class="listbox" data-droplist="${l.id}">
    <div class="sec list click" data-togglelist="${l.id}">
      <span class="t"><span class="caret">▾</span> ${esc(l.name)} <span class="n">${items.length}</span></span>
      <span class="sum">${fmt(sum)}</span>
      <span class="act" data-edit-list="${l.id}">✎</span></div>
    ${items.length ? items.map(({ it, o, w }) => `<div class="li">
        <div class="m">
          <div class="n">${o.link ? `<a href="${esc(o.link)}" target="_blank" rel="noreferrer" data-stoplink>${esc(optionName(o))}</a>` : esc(optionName(o))}</div>
          <div class="ref ${w ? "click" : ""}" ${w ? `data-li-edit="${w.id}"` : ""}>↳ ${w ? esc(w.type) : "mangel fjernet"}</div>
        </div>
        <span class="price">${fmt((o.price || 0) * (it.qty || 1))}</span>
        <span class="x" data-rmitem="${l.id}|${o.id}" title="Fjern">✕</span>
      </div>`).join("") : `<div class="li empty">Tom – legg til produkter (alternativer fra mangler).</div>`}
    ${l.notes ? `<div class="li" style="color:var(--muted);font-size:12.5px">${esc(l.notes)}</div>` : ""}
    <div class="rowacts flat">
      <button class="btn ghost sm" data-add-items="${l.id}">+ Legg til varer</button>
      <div class="export-wrap">
        <button class="btn ghost sm" data-export-toggle="${l.id}">↓ Eksporter</button>
        ${state.exportMenu === l.id ? `<div class="export-menu">
          <button data-export-xlsx="${l.id}">▦ Excel (.xlsx)</button>
          <button data-export-print="${l.id}">⎙ Skriv ut / PDF</button>
        </div>` : ""}
      </div>
      ${items.length ? `<button class="btn brass sm" data-buy-list="${l.id}">✓ Marker kjøpt</button>` : ""}
      <span style="flex:1"></span>
      <span class="act red" data-del-list="${l.id}">Slett</span>
    </div>
    ${l.budget ? `<div class="budget ${over ? "over" : ""}">
      <div class="b1"><span>Budsjett ${fmt(l.budget)}</span><b>${over ? "Over med " + fmt(sum - l.budget) : fmt(l.budget - sum) + " igjen"}</b></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>` : ""}</div>`;
}
function viewListArchive(archived) {
  return `
    <div class="pad" style="padding-top:16px"><button class="btn ghost sm" data-act="toggle-archive">← Tilbake</button></div>
    <div class="panel">
      <div class="sec"><span class="t">Kjøpt / arkiverte lister <span class="n">${archived.length}</span></span></div>
      ${archived.length ? archived.map((l) => `<div class="li">
        <div class="m"><div class="n">${esc(l.name)}</div>
          <div class="ref" style="color:var(--ok)">✓ Kjøpt${l.archived_at ? " · " + esc(String(l.archived_at).slice(0, 10)) : ""}</div></div>
        <span class="act" data-unarchive="${l.id}">↩ Gjenåpne</span>
        <span class="act red" data-del-list="${l.id}">Slett</span>
      </div>`).join("") : `<div class="muted-note">Ingen arkiverte lister.</div>`}
    </div>`;
}

// ── Merker ───────────────────────────────────────────────────────────
function viewMerker() {
  const brands = state.brands.filter((b) => hit(b.name, b.notes, ...brandCats(b)));
  // Et merke som er foretrukket innen flere kategorier står under hver av dem.
  const cats = [...new Set(brands.flatMap(brandCats))];
  const order = BRAND_CATS.filter((c) => cats.includes(c)).concat(cats.filter((c) => !BRAND_CATS.includes(c)));
  const body = order.map((cat) => {
    const list = brands.filter((b) => brandCats(b).includes(cat));
    return `<div class="sec"><span class="t">${esc(cat)}</span><span class="colhead">${list.length}</span></div>
      ${list.map((b) => { const other = brandCats(b).filter((c) => c !== cat);
        const note = esc(b.notes) || "Foretrukket innen " + esc(cat).toLowerCase();
        return `<div class="brow" data-edit-brand="${b.id}">
        <div class="n"><b>${esc(b.name)}</b><span>${note}${other.length ? ` · også ${esc(other.join(", ").toLowerCase())}` : ""}</span></div>
        <span class="chev">›</span>
      </div>`; }).join("")}`;
  }).join("");
  return `
    ${searchBar("Søk merke", `<div class="add" data-act="add-brand">+ Nytt</div>`)}
    <div class="panel">${body || `<div class="muted-note">Ingen merker registrert ennå.</div>`}</div>`;
}

// ── Generér oversikt ─────────────────────────────────────────────────
// Felles utvalg for rapport-HTML og -tekst: [{ i: rot, kids: [{ i, depth }] }]
// pr. inkludert rot, i tre-rekkefølge. Respekterer min-tilstand/-kvalitet,
// report_excluded (skjuler hele subtreet) og report_depth (barnenivåer pr. rot).
function reportItems() {
  const minS = state.ovMinStatus, minQ = state.ovMinQuality;
  const pass = (i) => (minS === "Alle" || STATUS_RANK[i.status] >= STATUS_RANK[minS]) && (minQ === "Alle" || QUALITY_RANK[i.quality] >= QUALITY_RANK[minQ]);
  const collect = (i, depth, maxDepth, kids) => {
    if (depth > maxDepth) return;
    for (const c of invChildren(i.id)) {
      if (c.report_excluded || !pass(c)) continue;
      kids.push({ i: c, depth });
      collect(c, depth + 1, maxDepth, kids);
    }
  };
  const entries = [];
  invRoots().forEach((r) => {
    if (r.report_excluded || !pass(r)) return;
    const kids = [];
    collect(r, 1, r.report_depth || 0, kids);
    entries.push({ i: r, kids });
  });
  return entries;
}
// Grupperer like linjer (samme nøkkel + dybde) med antall. Bevarer rekkefølgen.
function groupLines(lines) {
  const groups = []; const gm = new Map();
  lines.forEach(({ i, depth }) => {
    const k = depth + "|" + [i.type, i.brand, i.model, i.size].join("|");
    if (!gm.has(k)) { gm.set(k, { i, depth, n: 0 }); groups.push(k); }
    gm.get(k).n++;
  });
  return groups.map((k) => gm.get(k));
}
// Pr. kategori (etter rotens kategori): enkle røtter gruppert ×n, røtter med
// barn som egne linjer fulgt av grupperte, innrykkede barnelinjer.
function reportLinesByCat() {
  const entries = reportItems();
  return CATEGORIES.map((c) => {
    const inCat = entries.filter((e) => e.i.category === c);
    if (!inCat.length) return null;
    const lines = [
      ...groupLines(inCat.filter((e) => !e.kids.length).map((e) => ({ i: e.i, depth: 0 }))),
      ...inCat.filter((e) => e.kids.length).flatMap((e) => [{ i: e.i, depth: 0, n: 1 }, ...groupLines(e.kids)]),
    ];
    return { cat: c, lines };
  }).filter(Boolean);
}
function viewGenerer() {
  const date = new Date().toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
  const sel = (label, key, val, opts) => `<div class="field"><label>${label}</label><select data-ov="${key}">${opts.map((o) => `<option value="${o[0]}" ${val === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></div>`;
  return `
    <div class="gen-controls">
      ${sel("Minste tilstand", "status", state.ovMinStatus, [["Alle", "Alle"], ["ødelagt", "Min. ødelagt"], ["redusert", "Min. redusert"], ["ok", "Kun OK"]])}
      ${sel("Minste kvalitet", "quality", state.ovMinQuality, [["Alle", "Alle"], ["dårlig", "Min. dårlig"], ["greit", "Min. greit"], ["bra", "Kun bra"]])}
      <div style="flex:1"></div>
      <button class="btn ghost sm ${state.genCustomize ? "on" : ""}" data-act="toggle-gen-custom">⚙ Tilpass</button>
      <button class="btn ghost sm" data-act="copy-report">⧉ Kopier</button>
      <button class="btn ghost sm" data-act="print-report">⎙ Skriv ut</button>
      <button class="btn brass" data-act="download-report">↓ Last ned</button>
    </div>
    ${state.genCustomize ? genCustomizePanel() : `
    <div class="report" id="report">
      <div class="report-head">
        <div>
          <h2>Slagverksoversikt Randaberg Musikkorps</h2>
          <div class="date">Sist oppdatert: ${date}</div>
        </div>
        <img class="report-logo" src="/randaberg-logo-red.png" alt="Randaberg Musikkorps" onerror="this.style.display='none'" />
      </div>
      <div class="grid2">
        ${reportLinesByCat().map(({ cat, lines }) => `<div class="cat"><h4>${cat}</h4>
          ${lines.map(({ i, depth, n }) => { const det = [i.brand, i.model, i.size].filter(Boolean).join(" · ");
            return `<div class="item ${depth ? "sub" : ""}" ${depth > 1 ? `style="padding-left:${depth * 14}px"` : ""}><span>${esc(i.type)}${n > 1 ? ` <span class="cnt">×${n}</span>` : ""}</span><span class="det">${esc(det)}</span></div>`; }).join("")}
        </div>`).join("")}
      </div>
      <div class="footer-note">Ta kontakt med jorgen.jarnes@gmail.com ved spørsmål om utstyret.</div>
    </div>`}`;
}
// Tilpass-modus: én rad pr. element (individuelt – ekskludering er pr. id, ikke
// pr. gruppe). Alle etterkommere rendres alltid; dybdevalget dimmer dem bare
// (klassen rep-off), så toggling ikke trenger render().
function genCustomizePanel() {
  const repRow = (i, level, rootId) => {
    const det = [i.brand, i.model, i.size].filter(Boolean).join(" · ");
    const kids = invChildren(i.id);
    const depth = Number(i.report_depth) || 0;
    const hasGrand = kids.some((c) => invChildren(c.id).length);
    const off = level > 0 && level > (Number(inv(rootId)?.report_depth) || 0);
    return `<div class="rep-row ${i.report_excluded ? "rep-excluded" : ""} ${off ? "rep-off" : ""}"
        ${level ? `data-rep-under="${rootId}" data-rep-level="${level}" style="padding-left:${14 + level * 22}px"` : ""}>
        <label class="rep-check"><input type="checkbox" data-rep-ex="${i.id}" ${i.report_excluded ? "" : "checked"}></label>
        <span class="rt">${esc(i.type)}${det ? ` <span class="det">${esc(det)}</span>` : ""}</span>
        ${!level && kids.length ? `<div class="seg rep-depth">
          <button type="button" data-rep-depth="${i.id}|0" class="${depth === 0 ? "on" : ""}">Kun enheten</button>
          <button type="button" data-rep-depth="${i.id}|1" class="${depth === 1 || (!hasGrand && depth > 1) ? "on" : ""}">+ deler</button>
          ${hasGrand ? `<button type="button" data-rep-depth="${i.id}|99" class="${depth >= 2 ? "on" : ""}">Alle nivåer</button>` : ""}
        </div>` : ""}
      </div>`
      + kids.map((c) => repRow(c, level + 1, rootId)).join("");
  };
  const roots = invRoots();
  const cats = CATEGORIES.filter((c) => roots.some((i) => i.category === c));
  return `<div class="panel rep-config">
    <p class="muted-note" style="padding:12px 14px 0">Velg hva som tas med i oversikten. Valgene lagres og gjelder også utskrift og nedlasting.</p>
    ${cats.map((c) => `<div class="sec"><span class="t">${c}</span></div>
      ${roots.filter((i) => i.category === c).map((i) => repRow(i, 0, i.id)).join("")}`).join("")}
  </div>`;
}
function reportText() {
  let out = `Slagverksoversikt Randaberg Musikkorps\nSist oppdatert: ${new Date().toLocaleDateString("nb-NO")}\n`;
  reportLinesByCat().forEach(({ cat, lines }) => {
    out += `\n${cat}\n`;
    lines.forEach(({ i, depth, n }) => { const det = [i.brand, i.model, i.size].filter(Boolean).join(" · ");
      out += `  ${"    ".repeat(depth)}${i.type}${n > 1 ? ` ×${n}` : ""}${det ? "  –  " + det : ""}\n`; });
  });
  return out;
}

// ── Ark (skjemaer) ───────────────────────────────────────────────────
function sheet({ title, sub, body, del, saveAct }) {
  return `<div class="sheet-bg" data-act="close-modal"><div class="sheet" data-stop>
    <div class="grab"></div>
    <div class="shead"><div class="t"><h3>${esc(title)}</h3>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>
      <button class="x" data-act="close-modal">✕</button></div>
    <div class="sbody">${body}</div>
    <div class="sfoot">
      ${del ? `<button class="btn danger" data-act="${del}">Slett</button>` : ""}
      <span class="spacer"></span>
      <button class="btn ghost" data-act="close-modal">Avbryt</button>
      <button class="btn" data-act="${saveAct}">Lagre</button>
    </div>
  </div></div>`;
}
const fTxt = (label, key, item, type = "text", extra = "") =>
  `<div class="field"><label>${label}</label><input data-f="${key}" type="${type}" value="${esc(item[key] ?? "")}" ${extra} /></div>`;
const fArea = (label, key, item, ph = "") =>
  `<div class="field"><label>${label}</label><textarea data-f="${key}" placeholder="${esc(ph)}">${esc(item[key] ?? "")}</textarea></div>`;
const fSel = (label, key, item, opts) =>
  `<div class="field"><label>${label}</label><select data-f="${key}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(item[key] ?? "") === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
// Segmentert valg – erstatter nedtrekk med få faste verdier.
const fSeg = (label, key, item, kind, opts) =>
  `<div class="field"><label>${label}</label><div class="seg ${kind}">${opts.map(([v, t]) =>
    `<button type="button" data-seg="${key}|${esc(v)}" data-v="${esc(v)}" class="${item[key] === v ? "on" : ""}">${esc(t)}</button>`).join("")}</div></div>`;

function renderModal() {
  const m = state.modal;
  if (m.kind === "list-form") return sheetListForm(m);
  if (m.kind === "list-items") return sheetListItems(m);
  if (m.kind === "brand-form") return sheetBrandForm(m);
  if (m.kind === "option-form") return sheetOptionForm(m);
  if (m.kind === "choose-list") return sheetChooseList(m);
  if (m.kind === "choose-option") return sheetChooseOption(m);
  return m.kind.includes("inv") ? sheetInv(m) : sheetWish(m);
}
function sheetInv(m) {
  const item = m.item, isNew = m.kind.startsWith("add");
  const parentOpts = (() => {
    const skip = new Set([item.id, ...(item.id ? invDescendants(item.id) : [])]);
    return state.inventory.filter((p) => !skip.has(p.id));
  })();
  const body = `
    <datalist id="brandlist">${state.brands.map((b) => `<option value="${esc(b.name)}">`).join("")}</datalist>
    <div class="fset"><div class="leg">Hva det er</div>
      ${fTxt("Type", "type", item)}
      <div class="frow">
        <div class="field"><label>Merke</label><input data-f="brand" list="brandlist" value="${esc(item.brand ?? "")}" placeholder="—" /></div>
        ${fTxt("Modell", "model", item, "text", 'placeholder="—"')}
      </div>
      <div class="frow">
        ${fTxt("Størrelse", "size", item, "text", 'placeholder="—"')}
        ${fSel("Kategori", "category", item, CATEGORIES.map((c) => [c, c]))}
      </div>
    </div>
    <div class="fset"><div class="leg">Tilstand og kvalitet</div>
      ${fSeg("Tilstand", "status", item, "status", STATUSES.map((s) => [s, STATUS_LABEL[s]]))}
      ${fSeg("Kvalitet", "quality", item, "quality", QUALITIES.map((q) => [q, QUALITY_LABEL[q]]))}
    </div>
    <div class="fset"><div class="leg">Plassering og notat</div>
      ${fSel("Del av komponent", "parent_id", item, [["", "– ingen (toppnivå) –"], ...parentOpts.map((p) => [p.id, invPath(p).concat(p.type).join(" › ")])])}
      ${fArea("Merknader", "notes", item, "f.eks. hvor den står, hva som er slitt")}
    </div>`;
  const sub = item.category ? `${item.category}${item.updated_at ? " · sist endret " + String(item.updated_at).slice(0, 10) : ""}` : "";
  return sheet({ title: isNew ? "Legg til utstyr" : "Rediger utstyr", sub, body, del: isNew ? null : "del", saveAct: "save" });
}
function sheetWish(m) {
  const item = m.item, isNew = m.kind.startsWith("add");
  const repl = !!item.replaces_inventory_id;
  const invReplaceOpts = state.inventory.filter((i) => i.quality === "dårlig" || i.status !== "ok");
  const n = (item.options || []).length;
  const body = `
    <div class="fset">
      ${fTxt("Type", "type", item)}
      ${fSel("Kategori", "category", item, CATEGORIES.map((c) => [c, c]))}
    </div>
    <div class="fset">
      ${fSeg("Prioritet", "priority", item, "priority", PRIORITIES.map((p) => [p, PRI_LABEL[p]]))}
      <div class="field"><label>Estimert pris</label>
        <div class="suffix"><input data-f="estimated_price" type="number" value="${esc(item.estimated_price ?? "")}" placeholder="0" /><span class="u">kr</span></div>
      </div>
      <div class="field"><label>Produktlenke</label>
        <div class="withbtn">
          <input data-f="link" value="${esc(item.link ?? "")}" placeholder="https://…" />
          <button class="btn brass sm" data-act="wish-price" style="white-space:nowrap">⟳ Pris</button>
        </div>
      </div>
    </div>
    <div class="fset">
      <div class="switch" style="margin-bottom:12px">
        <div class="m"><b>Erstatter eksisterende utstyr</b><span class="swnote">${repl ? "På — velg hva som byttes ut" : "Av — dette er en vanlig mangel"}</span></div>
        <div class="sw ${repl ? "on" : ""}" data-switch="replaces_inventory_id"><i></i></div>
      </div>
      <!-- Alltid rendret, bare skjult når bryteren er av: da slipper bryteren å
           bygge om arket, og readFields() hopper over skjulte felter. -->
      <div data-switchbox="replaces_inventory_id" ${repl ? "" : "hidden"}>
        ${fSel("Erstatter", "replaces_inventory_id", item, invReplaceOpts.map((i) => [i.id, `${i.type} (${i.quality}/${STATUS_LABEL[i.status]})`]))}
      </div>
      ${fArea("Merknader", "notes", item, "valgfritt")}
    </div>`;
  return sheet({
    title: isNew ? "Legg til mangel" : "Rediger mangel",
    sub: n ? `${n} alternativ${n > 1 ? "er" : ""} knyttet til denne` : "",
    body, del: isNew ? null : "del", saveAct: "save",
  });
}
function sheetOptionForm(m) {
  const item = m.item, isNew = !item.id;
  const body = `
    <datalist id="brandlist">${state.brands.map((b) => `<option value="${esc(b.name)}">`).join("")}</datalist>
    <div class="fset">
      <div class="field"><label>Produsent / merke</label><input data-f="brand" list="brandlist" value="${esc(item.brand ?? "")}" /></div>
      <div class="frow">${fTxt("Modell", "model", item)}${fTxt("Størrelse", "size", item)}</div>
      ${fArea("Annen info", "info", item)}
    </div>
    <div class="fset">
      <div class="field"><label>Pris</label>
        <div class="suffix"><input data-f="price" type="number" value="${esc(item.price ?? "")}" placeholder="0" /><span class="u">kr</span></div>
      </div>
      <div class="field"><label>Produktlenke</label>
        <div class="withbtn">
          <input data-f="link" value="${esc(item.link ?? "")}" placeholder="https://…" />
          <button class="btn brass sm" data-act="opt-price" style="white-space:nowrap">⟳ Pris</button>
        </div>
      </div>
    </div>`;
  return sheet({ title: isNew ? "Nytt alternativ" : "Rediger alternativ", body, del: isNew ? null : "del-opt", saveAct: "save-opt" });
}
function sheetBrandForm(m) {
  const item = m.item, isNew = !item.id;
  const cats = new Set(item.categories || []);
  const usedInv = item.name ? state.inventory.filter((i) => (i.brand || "") === item.name).length : 0;
  const usedOpt = item.name ? state.wishlist.reduce((a, w) => a + (w.options || []).filter((o) => (o.brand || "") === item.name).length, 0) : 0;
  const body = `
    <div class="fset">
      <div class="field"><label>Navn</label><input data-f="name" value="${esc(item.name ?? "")}" placeholder="f.eks. Adams" style="font-family:var(--font-display);font-size:17px;font-weight:600" /></div>
      <div class="field"><label>Foretrukket innen <span style="font-weight:400;color:var(--faint)">– velg én eller flere</span></label>
        <div class="chips">${BRAND_CATS.map((c) => `<span class="chip ${cats.has(c) ? "on" : ""}" data-catchip="${esc(c)}">${esc(c)}</span>`).join("")}</div>
      </div>
      ${fArea("Notat", "notes", item, "hva merket er bra på")}
      ${!isNew ? `<div class="hint"><div class="leg">I bruk</div><div class="v">${usedInv} enhet${usedInv === 1 ? "" : "er"} i inventaret · ${usedOpt} alternativ${usedOpt === 1 ? "" : "er"} i Mangler</div></div>` : ""}
    </div>`;
  return sheet({ title: isNew ? "Nytt merke" : "Rediger merke", body, del: isNew ? null : "del-brand", saveAct: "save-brand" });
}
function sheetListForm(m) {
  const item = m.item, isNew = !item.id;
  const body = `<div class="fset">
    ${fTxt("Navn", "name", item, "text", 'placeholder="f.eks. NM 2026"')}
    <div class="field"><label>Budsjett (valgfritt)</label>
      <div class="suffix"><input data-f="budget" type="number" value="${esc(item.budget ?? "")}" placeholder="0" /><span class="u">kr</span></div>
    </div>
    ${fArea("Notat", "notes", item)}
  </div>`;
  return sheet({ title: isNew ? "Ny innkjøpsliste" : "Rediger liste", body, del: isNew ? null : "del-list-sheet", saveAct: "save-list" });
}
function sheetListItems(m) {
  const l = byId(state.lists, m.listId); if (!l) { state.modal = null; return ""; }
  const inList = new Set((l.items || []).map((it) => it.option_id));
  const body = `<div class="fset">
    <p style="color:var(--muted);font-size:12.5px;margin:0 0 10px">En liste inneholder konkrete produkter. Huk av alternativene som skal kjøpes.</p>
    <div class="picklist">${state.wishlist.map((w) => {
      const opts = w.options || [];
      const head = `<div class="pick-mangel">${esc(w.type)} <span style="color:var(--faint);font-size:11px">${esc(w.category)}</span></div>`;
      if (!opts.length) return head + `<div class="pick-empty">Ingen alternativ ennå – legg til et i Mangler først.</div>`;
      return head + opts.map((o) => `<label class="pick-opt"><input type="checkbox" data-toggleitem="${l.id}|${o.id}" ${inList.has(o.id) ? "checked" : ""}>
        <span style="flex:1;min-width:0">${esc(optionName(o))}</span>
        <span class="price">${fmt(o.price)}</span></label>`).join("");
    }).join("")}</div>
  </div>`;
  return `<div class="sheet-bg" data-act="close-modal"><div class="sheet" data-stop>
    <div class="grab"></div>
    <div class="shead"><div class="t"><h3>Produkter i «${esc(l.name)}»</h3></div><button class="x" data-act="close-modal">✕</button></div>
    <div class="sbody">${body}</div>
    <div class="sfoot"><span class="spacer"></span><button class="btn" data-act="close-modal">Ferdig</button></div>
  </div></div>`;
}
function sheetChooseList(m) {
  const o = optionById(m.optionId); const active = state.lists.filter((l) => !l.archived_at);
  const body = `<div class="fset">
    ${active.length ? `<div class="picklist">${active.map((l) => `<label data-choose-list="${l.id}"><span style="flex:1">${esc(l.name)}</span><span class="price">${fmt(listSum(l))}</span></label>`).join("")}</div>`
      : `<p style="color:var(--muted)">Du har ingen lister ennå.</p>`}
  </div>`;
  return `<div class="sheet-bg" data-act="close-modal"><div class="sheet" data-stop>
    <div class="grab"></div>
    <div class="shead"><div class="t"><h3>Legg i liste</h3><div class="sub">${esc(optionName(o))}</div></div><button class="x" data-act="close-modal">✕</button></div>
    <div class="sbody">${body}</div>
    <div class="sfoot"><button class="btn ghost sm" data-act="add-list">+ Ny liste</button><span class="spacer"></span>
      <button class="btn ghost" data-act="close-modal">Lukk</button></div>
  </div></div>`;
}

// Velg alternativ når en mangel med flere alternativer droppes i en liste.
function sheetChooseOption(m) {
  const w = wish(m.wishId); const l = byId(state.lists, m.listId);
  if (!w || !l) { state.modal = null; return ""; }
  const body = `<div class="fset">
    <div class="picklist">${(w.options || []).map((o) => `<label data-choose-opt="${o.id}"><span style="flex:1">${esc(optionName(o))}</span><span class="price">${fmt(o.price)}</span></label>`).join("")}</div>
  </div>`;
  return `<div class="sheet-bg" data-act="close-modal"><div class="sheet" data-stop>
    <div class="grab"></div>
    <div class="shead"><div class="t"><h3>Hvilket alternativ?</h3><div class="sub">${esc(w.type)} → «${esc(l.name)}»</div></div><button class="x" data-act="close-modal">✕</button></div>
    <div class="sbody">${body}</div>
    <div class="sfoot"><span class="spacer"></span><button class="btn ghost" data-act="close-modal">Avbryt</button></div>
  </div></div>`;
}

// ── Bunn: AI-bar + fanelinje (chat-panel erstatter begge når åpen) ────
function renderBottom() {
  const open = state.chatOpen;
  return `
    <div class="bottom ${open ? "open" : ""}" id="dock"><div class="inner">
      <div class="dock-bar" data-act="open-chat">
        ${logo(22, "red")}
        <span class="ph">Spør eller endre …</span>
        <span class="ai">AI</span>
      </div>
      <nav class="tabbar">
        ${TABS.map(([k, l]) => `<button class="${state.tab === k ? "active" : ""}" data-tab="${k}">${l}<span class="u"></span></button>`).join("")}
      </nav>
      <div class="dock-panel" id="dockPanel">
        <div class="dock-head">${logo(26, "red")}
          <div><div class="t">Assistent</div><div class="sub">Legger til / endrer for deg</div></div>
          <button class="close" data-act="close-chat">×</button></div>
        <div class="chat-log" id="chatLog">
          ${state.chat.length === 0 ? `<div class="msg ai"><div class="bubble">Hei! Si fra hva du oppdager – f.eks. «xylofonen er ødelagt», «legg til en ny tamburin», eller «lag en innkjøpsliste for NM med paukene». Jeg fikser det.</div></div>` : ""}
          ${state.chat.map((m) => `<div class="msg ${m.role === "user" ? "user" : "ai"}"><div class="bubble">${esc(m.role === "user" ? m.content : stripMd(m.content))}</div></div>`).join("")}
          ${state.chatBusy ? `<div class="msg ai"><div class="bubble">…</div></div>` : ""}
        </div>
        <div class="chat-input"><input id="chatInput" placeholder="Skriv en melding…" ${state.chatBusy ? "disabled" : ""} /><button class="btn" data-act="send-chat">Send</button></div>
      </div>
    </div></div>
    <div class="dock-scrim ${open ? "show" : ""}" data-act="close-chat"></div>`;
}

// ── Event wiring ─────────────────────────────────────────────────────
function wire() {
  const q = (sel) => root.querySelectorAll(sel);
  q("[data-tab]").forEach((b) => b.onclick = () => {
    state.tab = b.dataset.tab; state.modal = null; state.q = ""; state.searchFocus = false;
    state.retiredView = false; state.listArchive = false; state.genCustomize = false; render();
  });
  q("[data-ov]").forEach((s) => s.onchange = () => { state["ovMin" + s.dataset.ov[0].toUpperCase() + s.dataset.ov.slice(1)] = s.value; render(); });

  // Søk (behold fokus og markør etter re-render)
  const si = root.querySelector("#searchInput");
  if (si) {
    si.oninput = () => {
      state.q = si.value; state.searchFocus = true; state.searchCaret = si.selectionStart;
      // Rebygget i render() fyrer blur på det gamle feltet (Chrome gjør det før
      // elementet fjernes) – koble av handleren så det ikke tolkes som ekte blur.
      si.onblur = null;
      render();
    };
    si.onblur = () => { state.searchFocus = false; };
    if (state.searchFocus) {
      si.focus();
      const pos = state.searchCaret ?? si.value.length;
      si.setSelectionRange(pos, pos);
    }
  }

  // Filtre. Chips i filterarket oppdaterer seg selv og tellern – lista bak
  // tegnes på nytt når arket lukkes, ikke for hvert kryss (samme grunn som i
  // skjema-arkene: unngå at flaten hopper mens du velger).
  q("[data-facet]").forEach((el) => el.onclick = () => {
    const [key, val] = splitFirst(el.dataset.facet); const arr = state.filters[key];
    const i = arr.indexOf(val); if (i >= 0) arr.splice(i, 1); else arr.push(val);
    el.classList.toggle("on", i < 0);
    const c = root.querySelector("[data-filtercount]");
    if (c) c.textContent = `${activeFilterCount()} aktive`;
  });
  q("[data-rmfilter]").forEach((el) => el.onclick = () => {
    const [key, val] = splitFirst(el.dataset.rmfilter);
    state.filters[key] = state.filters[key].filter((x) => x !== val); render();
  });
  q("[data-stat]").forEach((el) => el.onclick = () => {
    const [facet, val] = splitFirst(el.dataset.stat.replace(":", "|"));
    state.filters[facet] = statActive(facet, val) ? [] : [val]; render();
  });

  q("[data-edit-inv]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openModal({ kind: "edit-inv", item: { ...inv(el.dataset.editInv) } }); });
  q("[data-edit-wish]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openModal({ kind: "edit-wish", item: { ...wish(el.dataset.editWish) } }); });
  q("[data-togglegroup]").forEach((el) => el.onclick = () => { const k = decodeURIComponent(el.dataset.togglegroup); state.expandedGroups[k] = !state.expandedGroups[k]; render(); });
  q("[data-togglenode]").forEach((el) => el.onclick = (e) => { if (e.target.closest("[data-edit-inv],[data-add-child],[data-goto-wish]")) return; const id = el.dataset.togglenode; state.expandedNodes[id] = !state.expandedNodes[id]; render(); });
  q("[data-add-child]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const par = inv(el.dataset.addChild); openModal({ kind: "add-inv", item: { type: "", brand: "", model: "", size: "", category: par ? par.category : "Trommer", status: "ok", quality: "ukjent", notes: "", parent_id: el.dataset.addChild } }); });
  q("[data-togglewish]").forEach((el) => el.onclick = (e) => { if (e.target.closest("[data-edit-wish],[data-goto-inv],[data-goto-list]")) return; state.expandedWish[el.dataset.togglewish] = !state.expandedWish[el.dataset.togglewish]; render(); });

  // Alternativer (options)
  q("[data-addopt]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openModal({ kind: "option-form", wishId: el.dataset.addopt, item: { brand: "", model: "", size: "", info: "", link: "", price: "" } }); });
  q("[data-edit-opt]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const [wid, oid] = splitFirst(el.dataset.editOpt); const w = wish(wid); const o = (w.options || []).find((x) => x.id === oid); openModal({ kind: "option-form", wishId: wid, item: { ...o } }); });
  q("[data-priceopt]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const [oid, link] = splitFirst(el.dataset.priceopt); fetchPriceUrl(link, (p) => api(`/options/${oid}`, { method: "PUT", body: JSON.stringify({ price: p }) })); });
  q("[data-addtolist]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openModal({ kind: "choose-list", optionId: el.dataset.addtolist }); });

  q("[data-goto-wish]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); state.tab = "mangler"; state.q = ""; render(); });
  q("[data-goto-inv]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); state.tab = "oversikt"; state.q = ""; render(); });
  q("[data-goto-list]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); state.tab = "lister"; state.q = ""; render(); });

  // Lister
  q("[data-edit-list]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openModal({ kind: "list-form", item: { ...byId(state.lists, el.dataset.editList) } }); });
  q("[data-togglelist]").forEach((el) => el.onclick = () => { const id = el.dataset.togglelist; state.collapsedLists[id] = !state.collapsedLists[id]; render(); });
  q("[data-add-items]").forEach((el) => el.onclick = () => openModal({ kind: "list-items", listId: el.dataset.addItems }));
  q("[data-export-toggle]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const id = el.dataset.exportToggle; state.exportMenu = state.exportMenu === id ? null : id; render(); });
  q("[data-export-xlsx]").forEach((el) => el.onclick = () => { state.exportMenu = null; exportListExcel(byId(state.lists, el.dataset.exportXlsx)); render(); });
  q("[data-export-print]").forEach((el) => el.onclick = () => { const l = byId(state.lists, el.dataset.exportPrint); state.exportMenu = null; render(); setTimeout(() => printList(l), 30); });
  q("[data-del-list]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); if (confirm("Slette listen?")) deleteList(el.dataset.delList); });
  q("[data-rmitem]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const [lid, oid] = splitFirst(el.dataset.rmitem); toggleListItem(lid, oid, false); });
  // Oppfyllelse / arkiv
  q("[data-buyopt]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const [wid, oid] = splitFirst(el.dataset.buyopt); fulfillWish(wid, oid); });
  q("[data-buywish]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); fulfillWish(el.dataset.buywish, null); });
  q("[data-buy-list]").forEach((el) => el.onclick = () => fulfillListBuy(el.dataset.buyList));
  q("[data-unretire]").forEach((el) => el.onclick = () => setRetired(el.dataset.unretire, false));
  q("[data-del-inv]").forEach((el) => el.onclick = () => { if (confirm("Slette utgått utstyr permanent?")) deleteInventory(el.dataset.delInv); });
  q("[data-unarchive]").forEach((el) => el.onclick = () => setArchived(el.dataset.unarchive, false));
  q("[data-li-edit]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); if (!el.dataset.liEdit) return; openModal({ kind: "edit-wish", item: { ...wish(el.dataset.liEdit) } }); });
  q("[data-toggleitem]").forEach((cb) => cb.onchange = () => { const [lid, oid] = splitFirst(cb.dataset.toggleitem); toggleListItem(lid, oid, cb.checked); });
  q("[data-choose-list]").forEach((el) => el.onclick = () => addToListChosen(el.dataset.chooseList, state.modal.optionId));
  q("[data-choose-opt]").forEach((el) => el.onclick = () => addToListChosen(state.modal.listId, el.dataset.chooseOpt));

  // Dra-og-slipp (kun delt desktop-visning): alternativ eller mangel-rad →
  // innkjøpsliste. addToList på serveren er en idempotent upsert, så et
  // gjentatt slipp lager aldri duplikat.
  q("[data-drag-opt],[data-drag-wish]").forEach((el) => {
    el.ondragstart = (e) => {
      const w = el.dataset.dragWish ? wish(el.dataset.dragWish) : null;
      dragPayload = el.dataset.dragOpt ? { optionId: el.dataset.dragOpt }
        : (w.options || []).length === 1 ? { optionId: w.options[0].id } : { wishId: w.id };
      e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", "");
      el.classList.add("dragging");
    };
    el.ondragend = () => { dragPayload = null; el.classList.remove("dragging"); };
  });
  q("[data-droplist]").forEach((el) => {
    el.ondragover = (e) => { if (!dragPayload) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; el.classList.add("drop-hover"); };
    el.ondragleave = (e) => { if (el.contains(e.relatedTarget)) return; el.classList.remove("drop-hover"); };
    el.ondrop = (e) => {
      e.preventDefault(); el.classList.remove("drop-hover");
      const p = dragPayload; dragPayload = null; if (!p) return;
      if (p.optionId) return addToListChosen(el.dataset.droplist, p.optionId);
      openModal({ kind: "choose-option", listId: el.dataset.droplist, wishId: p.wishId });
    };
  });
  q("[data-stoplink]").forEach((el) => el.onclick = (e) => e.stopPropagation());

  // Merker
  q("[data-edit-brand]").forEach((el) => el.onclick = () => {
    const b = byId(state.brands, el.dataset.editBrand);
    openModal({ kind: "brand-form", item: { ...b, categories: brandCats(b) } });
  });

  // ── Kontroller inne i et ark ──────────────────────────────────────
  // Disse kaller BEVISST ikke render(). Et fullt rebygg av #root ville nullstille
  // markør, fokus, IME-komposisjon og scroll midt i utfyllingen. De endrer i stedet
  // bare sin egen klasse + `state.modal.item`; tekstfeltene beholder sine egne
  // DOM-verdier og plukkes opp av readFields() når du lagrer.
  q("[data-seg]").forEach((el) => el.onclick = (e) => {
    e.preventDefault();
    const [key, val] = splitFirst(el.dataset.seg);
    state.modal.item[key] = val;
    el.parentElement.querySelectorAll("[data-seg]").forEach((b) => b.classList.toggle("on", b === el));
  });
  // Rapport-tilpasning: selvbetjente kontroller – oppdaterer egen rad + state
  // optimistisk og lagrer i bakgrunnen. Rapporten tegnes fra state når man
  // forlater Tilpass, så ingen render() her.
  q("[data-rep-ex]").forEach((cb) => cb.onchange = () => {
    const i = inv(cb.dataset.repEx); if (!i) return;
    const val = cb.checked ? 0 : 1;
    const prev = i.report_excluded; i.report_excluded = val;
    cb.closest(".rep-row").classList.toggle("rep-excluded", !!val);
    api(`/inventory/${i.id}`, { method: "PUT", body: JSON.stringify({ report_excluded: val }) })
      .catch(() => { i.report_excluded = prev; cb.checked = !prev; cb.closest(".rep-row").classList.toggle("rep-excluded", !!prev); toast("Lagring feilet"); });
  });
  q("[data-rep-depth]").forEach((el) => el.onclick = () => {
    const [id, d] = splitFirst(el.dataset.repDepth); const i = inv(id); if (!i) return;
    const val = Number(d);
    el.parentElement.querySelectorAll("[data-rep-depth]").forEach((b) => b.classList.toggle("on", b === el));
    i.report_depth = val;
    q(`[data-rep-under="${id}"]`).forEach((r) => r.classList.toggle("rep-off", Number(r.dataset.repLevel) > val));
    api(`/inventory/${id}`, { method: "PUT", body: JSON.stringify({ report_depth: val }) }).catch(() => toast("Lagring feilet"));
  });

  // Merke-kategorier: flervalg. Minst én må stå igjen.
  q("[data-catchip]").forEach((el) => el.onclick = () => {
    const c = el.dataset.catchip;
    const cur = new Set(state.modal.item.categories || []);
    if (cur.has(c)) { if (cur.size === 1) return toast("Merket må ha minst én kategori"); cur.delete(c); }
    else cur.add(c);
    state.modal.item.categories = BRAND_CATS.filter((x) => cur.has(x));
    el.classList.toggle("on", cur.has(c));
  });
  q("[data-switch]").forEach((el) => el.onclick = () => {
    const key = el.dataset.switch;
    const box = root.querySelector(`[data-switchbox="${key}"]`);
    const sel = box && box.querySelector("select");
    const on = !el.classList.contains("on");
    if (on && sel && !sel.options.length) return toast("Ingen utstyr i dårlig stand å erstatte");
    el.classList.toggle("on", on);
    if (box) box.hidden = !on;                       // skjulte felter leses ikke av readFields()
    state.modal.item[key] = on && sel ? sel.value : "";
    const note = el.closest(".switch").querySelector(".swnote");
    if (note) note.textContent = on ? "På — velg hva som byttes ut" : "Av — dette er en vanlig mangel";
  });

  const chatInput = root.querySelector("#chatInput");
  if (chatInput && state.chatOpen) { chatInput.onkeydown = (e) => { if (e.key === "Enter") sendChat(chatInput.value); }; if (!state.chatBusy) chatInput.focus(); const log = root.querySelector("#chatLog"); if (log) log.scrollTop = log.scrollHeight; }

  q("[data-act]").forEach((el) => el.onclick = (e) => {
    const act = el.dataset.act;
    const A = {
      logout, "export-all": exportExcelAll, "fetch-prices": fetchAllPrices,
      "add-inv": () => openModal({ kind: "add-inv", item: { type: "", brand: "", model: "", size: "", category: "Trommer", status: "ok", quality: "ukjent", notes: "", parent_id: "" } }),
      "add-wish": () => openModal({ kind: "add-wish", item: { type: "", category: "Trommer", priority: "middels", estimated_price: "", link: "", notes: "", replaces_inventory_id: "" } }),
      "add-list": () => openModal({ kind: "list-form", item: { name: "", budget: "", notes: "" } }),
      "add-brand": () => openModal({ kind: "brand-form", item: { name: "", categories: ["Generelt"], notes: "" } }),
      "open-filtersheet": () => { state.filterSheet = true; render(); },
      "close-filtersheet": () => { state.filterSheet = false; render(); },
      "clear-filters": () => { state.filters = { category: [], status: [], quality: [], brand: [] }; render(); },
      "toggle-retired": () => { state.retiredView = !state.retiredView; render(); },
      "toggle-archive": () => { state.listArchive = !state.listArchive; render(); },
      "close-export": () => { state.exportMenu = null; render(); },
      "toggle-gen-custom": () => { state.genCustomize = !state.genCustomize; render(); },
      "copy-report": () => { navigator.clipboard.writeText(reportText()); toast("Kopiert"); },
      "print-report": () => window.print(),
      "download-report": () => downloadCSV([[reportText()]], "slagverksoversikt.txt"),
      "open-chat": openChat, "close-chat": closeChat,
      "send-chat": () => sendChat(root.querySelector("#chatInput").value),
      // Prisinnhenting ender i loadAll() → render(), så arket bygges om uansett.
      // Løs det ved å fryse alt som er skrevet inn i `item` FØR rebygget, slik at
      // det tegnes tilbake sammen med den hentede prisen.
      "wish-price": () => sheetFetchPrice("estimated_price"),
      "opt-price": () => sheetFetchPrice("price"),
      "del-list-sheet": () => { if (confirm("Slette listen?")) deleteList(state.modal.item.id); },
    };
    if (A[act]) return A[act]();
    if (act === "close-modal") { if (e.target.hasAttribute("data-stop")) return; state.modal = null; state.filterSheet = false; return render(); }
    if (act === "save" || act === "del") return modalAction(act);
    if (act === "save-list") return modalSaveList();
    if (act === "save-brand") return modalSaveBrand();
    if (act === "del-brand") return deleteBrand(state.modal.item.id);
    if (act === "save-opt") return modalSaveOption();
    if (act === "del-opt") return deleteOption(state.modal.item.id);
  });
  q("[data-stop]").forEach((el) => el.onclick = (e) => e.stopPropagation());
  applyDockViewport();
}
function splitFirst(s) { const i = s.indexOf("|"); return [s.slice(0, i), s.slice(i + 1)]; }

function openModal(m) { state.modal = m; render(); }
// Hent pris fra lenkefeltet i det åpne arket og skriv den i `priceKey`.
function sheetFetchPrice(priceKey) {
  const data = { ...state.modal.item, ...readFields() };
  if (!data.link) return toast("Legg inn en lenke først");
  state.modal.item = data;
  return fetchPriceUrl(data.link, (p) => { state.modal.item = { ...state.modal.item, [priceKey]: p }; return Promise.resolve(); });
}
// Leser feltene i det åpne arket. Skjulte felter (f.eks. «Erstatter» når bryteren
// er av) hoppes over – de skal ikke overstyre verdien handleren allerede satte.
function readFields() {
  const data = {};
  document.querySelectorAll(".sheet [data-f]").forEach((el) => {
    if (el.closest("[hidden]")) return;
    data[el.dataset.f] = el.value;
  });
  return data;
}
function modalAction(act) {
  const m = state.modal; if (!m) return;
  const data = { ...m.item, ...readFields() };
  const isInv = m.kind.includes("inv"); const isNew = m.kind.startsWith("add");
  if (act === "del") return isInv ? deleteInventory(data.id) : deleteWish(data.id);
  if (!data.type) return toast("Type er påkrevd");
  return isInv ? saveInventory(data, isNew) : saveWish(data, isNew);
}
function modalSaveList() {
  const data = { ...state.modal.item, ...readFields() };
  if (!data.name) return toast("Navn er påkrevd");
  data.budget = data.budget === "" ? null : Number(data.budget);
  return data.id ? saveList(data) : createList(data);
}
function modalSaveBrand() {
  const data = { ...state.modal.item, ...readFields() };
  if (!data.name) return toast("Navn er påkrevd");
  // Send hele settet – API-et erstatter kategoriene, det slår dem ikke sammen.
  const cats = BRAND_CATS.filter((c) => (data.categories || []).includes(c));
  data.categories = cats.length ? cats : ["Generelt"];
  return saveBrand(data, !data.id);
}
function modalSaveOption() {
  const data = { ...state.modal.item, ...readFields() };
  return saveOption(state.modal.wishId, data, !data.id);
}

// ── Chat open/close + tastatur ──
function openChat() { state.chatOpen = true; document.getElementById("dock")?.classList.remove("hide-bar"); render(); }
function closeChat() { state.chatOpen = false; const d = document.getElementById("dock"); if (d) d.style.bottom = "0px"; render(); }
function applyDockViewport() {
  const dock = document.getElementById("dock"); const panel = document.getElementById("dockPanel"); const vv = window.visualViewport;
  if (!dock) return;
  if (!state.chatOpen || !vv) { dock.style.bottom = "0px"; return; }
  const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  dock.style.bottom = kb + "px";
  if (panel) panel.style.height = Math.min(560, vv.height - 12) + "px";
}

// ── Globale lyttere (registreres én gang) ──
function isField(el) { return el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName); }
function initGlobalListeners() {
  const vv = window.visualViewport;
  if (vv) { vv.addEventListener("resize", applyDockViewport); vv.addEventListener("scroll", applyDockViewport); }
  document.addEventListener("focusin", (e) => {
    if (state.chatOpen) return;
    const inDock = e.target.closest && e.target.closest("#dock");
    if (isField(e.target) && !inDock) document.getElementById("dock")?.classList.add("hide-bar");
  });
  document.addEventListener("focusout", () => setTimeout(() => {
    const a = document.activeElement;
    if (!isField(a) || (a.closest && a.closest("#dock"))) document.getElementById("dock")?.classList.remove("hide-bar");
  }, 60));
}

// ── Sveip mellom faner (mobil) ──
function initSwipeNav() {
  const TAB_KEYS = TABS.map((t) => t[0]);
  let sx = 0, sy = 0, dx = 0, dy = 0, active = false, locked = false, mainEl = null, fromIdx = 0;
  const LOCK = 12;

  const blocked = (t) =>
    !state.code || state.chatOpen || state.modal || state.filterSheet ||
    window.innerWidth > 720 ||
    (t.closest && t.closest("nav.tabbar, #dock, .dock-scrim, .sheet-bg, select, input, textarea, a, button, [data-stop]"));

  const resetMain = (anim) => {
    if (!mainEl) return;
    mainEl.style.transition = anim ? "transform .2s ease, opacity .2s ease" : "none";
    mainEl.style.transform = "translateX(0)"; mainEl.style.opacity = "1";
  };

  root.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || blocked(e.target)) { active = false; return; }
    mainEl = root.querySelector("main"); if (!mainEl) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = dy = 0; active = true; locked = false;
    fromIdx = TAB_KEYS.indexOf(state.tab);
  }, { passive: true });

  root.addEventListener("touchmove", (e) => {
    if (!active) return;
    dx = e.touches[0].clientX - sx; dy = e.touches[0].clientY - sy;
    if (!locked) {
      if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
      if (Math.abs(dy) >= Math.abs(dx)) { active = false; return; }
      locked = true;
    }
    const atEnd = (dx < 0 && fromIdx >= TAB_KEYS.length - 1) || (dx > 0 && fromIdx <= 0);
    const d = atEnd ? dx * 0.3 : dx;
    mainEl.style.transition = "none";
    mainEl.style.transform = `translateX(${d}px)`;
    mainEl.style.opacity = String(Math.max(0.55, 1 - Math.abs(d) / window.innerWidth));
  }, { passive: true });

  root.addEventListener("touchend", () => {
    if (!active) return; active = false;
    if (!locked || !mainEl) return;
    const threshold = Math.max(80, window.innerWidth * 0.25);
    const dir = dx < 0 ? 1 : -1;
    const target = fromIdx + dir;
    if (Math.abs(dx) >= threshold && target >= 0 && target < TAB_KEYS.length) {
      const W = window.innerWidth;
      mainEl.style.transition = "transform .16s ease, opacity .16s ease";
      mainEl.style.transform = `translateX(${dir === 1 ? -W : W}px)`;
      mainEl.style.opacity = "0";
      setTimeout(() => {
        state.tab = TAB_KEYS[target]; state.modal = null; state.q = "";
        state.retiredView = false; state.listArchive = false;
        swipeIn = dir; render();
      }, 150);
    } else {
      resetMain(true);
    }
  }, { passive: true });
}

// ── Boot ──
try { screen.orientation && screen.orientation.lock && screen.orientation.lock("portrait").catch(() => {}); } catch { /* ikke støttet */ }
initGlobalListeners();
initSwipeNav();
// Delt visning + draggable-attributter avhenger av vindusbredden – tegn på nytt
// når brytepunktet krysses.
matchMedia("(min-width: 1024px)").addEventListener("change", () => { if (state.code) render(); });
(async function boot() {
  if (state.code) { try { await loadAll(); } catch { logout(); } }
  else render();
})();
