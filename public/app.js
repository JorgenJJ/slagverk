// ── Slagverksoversikt – frontend (buildless vanilla JS) ──
// Randaberg Musikkorps. Tema: regimental heritage (se styles.css).
// Konvensjoner for hele appen: se /CLAUDE.md i repoet.

const CATEGORIES = ["Trommer", "Melodisk", "Pauker", "Cymbaler", "Stativer", "Perkusjon", "Stikker og klubber"];
const BRAND_CATS = ["Generelt", ...CATEGORIES];
const PRIORITIES = ["høy", "middels", "lav"];
const STATUSES = ["ok", "redusert", "ødelagt"];
const QUALITIES = ["bra", "greit", "dårlig", "ukjent"];
const PRI_LABEL = { høy: "Høy", middels: "Middels", lav: "Lav" };
const STATUS_LABEL = { ok: "OK", redusert: "Redusert", ødelagt: "Ødelagt" };
const STATUS_RANK = { ok: 3, redusert: 2, ødelagt: 1 };
const QUALITY_RANK = { bra: 4, greit: 3, dårlig: 2, ukjent: 0 };
const TABS = [["oversikt", "Oversikt"], ["mangler", "Mangler"], ["lister", "Innkjøpslister"], ["merker", "Merker"], ["generer", "Generér oversikt"]];

const state = {
  code: localStorage.getItem("slagverk_code") || "",
  tab: "oversikt",
  inventory: [], wishlist: [], lists: [], brands: [],
  filters: { category: [], status: [], quality: [], brand: [] },
  openFilter: null, filterSheet: false,
  expandedGroups: {}, expandedWish: {}, expandedNodes: {},
  retiredView: false, listArchive: false,
  ovMinStatus: "Alle", ovMinQuality: "Alle",
  chat: [], chatBusy: false, chatOpen: false, lastActions: [],
  modal: null,
};

const root = document.getElementById("root");
const fmt = (n) => (n || n === 0 ? Number(n).toLocaleString("nb-NO") + " kr" : "–");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const byId = (arr, id) => arr.find((x) => x.id === id);
// Fjern vanlig markdown som ikke rendres i appen (sikkerhetsnett – modellen er
// også bedt om å skrive ren tekst). Stripper **fet**, __fet__, `kode`, #overskrift.
const stripMd = (s) => String(s ?? "")
  .replace(/\*\*(.+?)\*\*/g, "$1")
  .replace(/__(.+?)__/g, "$1")
  .replace(/`([^`]+)`/g, "$1")
  .replace(/^\s{0,3}#{1,6}\s+/gm, "");

// Ekte Randaberg-logo (public/randaberg-logo.png) med innebygd SVG-skjold som
// fallback dersom bildet ikke kan lastes.
function fallbackSVG(stroke) {
  return `<svg viewBox='0 0 48 48' width='100%' height='100%' fill='none'><path d='M24 3 6 8v17c0 11 8 18 18 22 10-4 18-11 18-22V8L24 3Z' fill='none' stroke='${stroke}' stroke-width='2.4' stroke-linejoin='round'/><circle cx='24' cy='22' r='8.2' fill='none' stroke='${stroke}' stroke-width='2.1'/><path d='M16.6 18.4 31.4 25.6M16.6 25.6 31.4 18.4' stroke='${stroke}' stroke-width='2.1' stroke-linecap='round'/></svg>`;
}
// variant: "full" (farge), "white" (hvite linjer/transparent – for rød bakgrunn),
// "red" (røde linjer/transparent – for lys bakgrunn).
function logo(size, variant = "full") {
  const src = variant === "white" ? "/randaberg-logo-white.png"
    : variant === "red" ? "/randaberg-logo-red.png" : "/randaberg-logo.png";
  const stroke = variant === "white" ? "#fff" : "#b11116";
  return `<span class="logo" style="width:${size}px;height:${size}px">
    <img src="${src}" alt="Randaberg Musikkorps" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
    <span class="logo-fb" style="display:none">${fallbackSVG(stroke)}</span>
  </span>`;
}

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
function priceDisplay(w) {
  const p = optionPrices(w);
  if (p.length) { const mn = Math.min(...p), mx = Math.max(...p); return mn === mx ? fmt(mn) : `${fmt(mn)} – ${fmt(mx)}`; }
  return fmt(w.estimated_price);
}
// Et produkt (alternativ) på tvers av alle mangler. Liste-linjer refererer til disse.
const optionById = (oid) => { for (const w of state.wishlist) { const o = (w.options || []).find((x) => x.id === oid); if (o) return o; } return null; };
const optionName = (o) => (o ? ([o.brand, o.model, o.size].filter(Boolean).join(" ") || "Alternativ") : "");
// En liste-linje ER et produkt (option_id). Sum = produktets pris.
const listSum = (l) => (l.items || []).reduce((a, it) => { const o = optionById(it.option_id); return a + (o && o.price != null ? o.price * (it.qty || 1) : 0); }, 0);
const manglerTotal = () => state.wishlist.reduce((a, w) => a + effPrice(w), 0);
const replacementFor = (invId) => state.wishlist.filter((w) => w.replaces_inventory_id === invId);
const listsWith = (wishId) => state.lists.filter((l) => (l.items || []).some((it) => it.wishlist_id === wishId));
const isErstatning = (w) => !!w.replaces_inventory_id;
// ── Inventar-tre (komponent → deler) ──
const invChildren = (id) => state.inventory.filter((i) => i.parent_id === id && !i.retired_at).sort((a, b) => (a.category + a.type).localeCompare(b.category + b.type));
const invRoots = () => state.inventory.filter((i) => (!i.parent_id || !inv(i.parent_id)) && !i.retired_at)
  .sort((a, b) => (a.category + a.type).localeCompare(b.category + b.type));
const invHasKids = (i) => state.inventory.some((x) => x.parent_id === i.id);
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
function exportListCSV(l) {
  const rows = [["Produkt", "For mangel", "Kategori", "Prioritet", "Antall", "Pris", "Sum", "Lenke"]];
  (l.items || []).forEach((it) => { const o = optionById(it.option_id); if (!o) return; const w = wish(it.wishlist_id);
    const p = o.price || 0;
    rows.push([optionName(o), w ? w.type : "", w ? w.category : "", w ? PRI_LABEL[w.priority] : "", it.qty || 1, p || "", p * (it.qty || 1), o.link || ""]); });
  rows.push([]); rows.push(["", "", "", "", "", "Sum:", listSum(l), ""]);
  downloadCSV(rows, `innkjopsliste-${l.name.replace(/\s+/g, "-").toLowerCase()}.csv`);
  toast("Liste eksportert");
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
// Legg/fjern et PRODUKT (option) i en liste.
async function toggleListItem(listId, optionId, on) {
  if (on) await api(`/lists/${listId}/items`, { method: "POST", body: JSON.stringify({ option_id: optionId }) });
  else await api(`/lists/${listId}/items/${optionId}`, { method: "DELETE" });
  await loadAll();
}
async function addToListChosen(listId, optionId) {
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
        // Gjenopprett slettet rad fra `before` (createX beholder id-en).
        if (a.kind === "option") await api(`/wishlist/${a.before.wishlist_id}/options`, { method: "POST", body: JSON.stringify(a.before) });
        else await api(coll, { method: "POST", body: JSON.stringify(a.before) });
      }
    } catch { /* fortsett */ }
  }
  await loadAll(); toast("Angret");
}

// ── Render ──
let prevTab = null;
let swipeIn = 0;   // 1 = ny fane skled inn fra høyre (neste), -1 = fra venstre (forrige)
function render() {
  if (!state.code) { prevTab = null; return renderLogin(); }
  // Behold scroll-posisjon, og animér <main> KUN ved faktisk fanebytte – ellers
  // føles hvert klikk som en full sideoppdatering.
  const scrollY = window.scrollY;
  const tabChanged = prevTab !== state.tab;
  prevTab = state.tab;
  root.innerHTML = `
    <header><div class="bar"><div class="brand">
      ${logo(44, "white")}
      <div class="titles"><h1>Slagverksoversikt</h1><small>Randaberg Musikkorps</small></div>
      <div class="spacer"></div>
      <button class="logout" data-act="logout">Logg ut</button>
    </div></div>
    <nav class="tabs"><div class="inner">
      ${TABS.map(([k, l]) => `<button class="${state.tab === k ? "active" : ""}" data-tab="${k}">${l}</button>`).join("")}
    </div></nav></header>
    <main>${
      state.tab === "oversikt" ? viewOversikt()
      : state.tab === "mangler" ? viewMangler()
      : state.tab === "lister" ? viewLister()
      : state.tab === "merker" ? viewMerker()
      : viewGenerer()
    }</main>
    ${renderDock()}
    ${state.modal ? renderModal() : ""}
    ${state.filterSheet ? renderFilterSheet() : ""}
  `;
  const mainEl = root.querySelector("main");
  if (swipeIn && mainEl) {
    // Sklid den nye fanen inn fra siden (sømløst etter sveip).
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
      <button class="btn" id="loginBtn" style="width:100%;justify-content:center">Logg inn</button>
      <p id="loginErr" style="color:var(--bad);margin-top:14px;display:none;text-transform:none;letter-spacing:0">Feil kode</p>
    </div></div>`;
  const go = async () => { try { await login(document.getElementById("code").value); } catch { document.getElementById("loginErr").style.display = "block"; } };
  document.getElementById("loginBtn").onclick = go;
  document.getElementById("code").onkeydown = (e) => { if (e.key === "Enter") go(); };
}

// ── Filtre ──
function brandOptions() {
  const set = new Set(state.inventory.map((i) => i.brand || ""));
  return [...set].sort((a, b) => a.localeCompare(b)).map((b) => ({ val: b, label: b || "(uten merke)" }));
}
const anyFilter = () => Object.values(state.filters).some((a) => a.length);
const statActive = (facet, val) => state.filters[facet].length === 1 && state.filters[facet][0] === val;
const activeFilterCount = () => Object.values(state.filters).reduce((a, x) => a + x.length, 0);
function passesFilters(i) {
  const f = state.filters;
  return (!f.category.length || f.category.includes(i.category))
    && (!f.status.length || f.status.includes(i.status))
    && (!f.quality.length || f.quality.includes(i.quality))
    && (!f.brand.length || f.brand.includes(i.brand || ""));
}
function filterDropdown(key, label, opts) {
  const sel = state.filters[key];
  const open = state.openFilter === key;
  return `<div class="filter-dd ${open ? "open" : ""}">
    <button class="filter-btn ${sel.length ? "active" : ""}" data-filter="${key}">${label}${sel.length ? ` <span class="fcount">${sel.length}</span>` : ""} <span class="caret">▾</span></button>
    ${open ? `<div class="filter-pop" data-stop>
      ${opts.map((o) => `<label><input type="checkbox" data-facet="${key}|${esc(o.val)}" ${sel.includes(o.val) ? "checked" : ""}> ${esc(o.label)}</label>`).join("")}
      ${sel.length ? `<button class="filter-clear" data-clearfacet="${key}">Nullstill ${label.toLowerCase()}</button>` : ""}
    </div>` : ""}
  </div>`;
}
function filterBar() {
  return `${state.openFilter ? `<div class="pop-catcher" data-act="close-filter"></div>` : ""}
  <div class="filterbar">
    <span class="filter-lead desktop-only">Filtre</span>
    <div class="filter-row desktop-only">
      ${filterDropdown("category", "Kategori", CATEGORIES.map((c) => ({ val: c, label: c })))}
      ${filterDropdown("status", "Tilstand", STATUSES.map((s) => ({ val: s, label: STATUS_LABEL[s] })))}
      ${filterDropdown("quality", "Kvalitet", QUALITIES.map((qv) => ({ val: qv, label: qv })))}
      ${filterDropdown("brand", "Merke", brandOptions())}
    </div>
    <button class="btn ghost sm mobile-only" data-act="open-filtersheet">⚙ Filtre${activeFilterCount() ? ` (${activeFilterCount()})` : ""}</button>
    ${anyFilter() ? `<button class="btn ghost sm" data-act="clear-filters">Nullstill alle</button>` : ""}
    <span class="spacer"></span>
    <button class="btn ghost sm" data-act="export-all">⬇ Eksporter</button>
    <button class="btn" data-act="add-inv">+ Legg til</button>
  </div>`;
}
function renderFilterSheet() {
  const group = (key, label, opts) => `<div class="sheet-group"><div class="sheet-label">${label}</div>
    <div class="sheet-opts">${opts.map((o) => `<label class="chip ${state.filters[key].includes(o.val) ? "on" : ""}"><input type="checkbox" data-facet="${key}|${esc(o.val)}" ${state.filters[key].includes(o.val) ? "checked" : ""} hidden> ${esc(o.label)}</label>`).join("")}</div></div>`;
  return `<div class="modal-bg" data-act="close-filtersheet"><div class="modal" data-stop>
    <h3>Filtre</h3>
    ${group("category", "Kategori", CATEGORIES.map((c) => ({ val: c, label: c })))}
    ${group("status", "Tilstand", STATUSES.map((s) => ({ val: s, label: STATUS_LABEL[s] })))}
    ${group("quality", "Kvalitet", QUALITIES.map((qv) => ({ val: qv, label: qv })))}
    ${group("brand", "Merke", brandOptions())}
    <div class="actions">${anyFilter() ? `<button class="btn danger" data-act="clear-filters">Nullstill alle</button>` : ""}<span class="spacer"></span><button class="btn" data-act="close-filtersheet">Ferdig</button></div>
  </div></div>`;
}

// ── Oversikt (med gruppering av like rader) ──
function groupKey(i) { return [i.type, i.brand, i.model, i.size, i.category, i.status, i.quality, i.notes].join(""); }
const invCells = (i) => `
  <td style="color:var(--muted)">${esc(i.brand) || "–"}</td>
  <td class="mono">${esc(i.size) || "–"}</td>
  <td><span class="mono">${esc(i.category)}</span></td>
  <td><span class="tag ${i.status}">${STATUS_LABEL[i.status]}</span></td>
  <td class="q-${i.quality}" style="font-weight:600">${esc(i.quality)}</td>
  <td style="color:var(--muted);font-size:13px">${esc(i.notes) || "–"}</td>`;
const invRepl = (i) => { const r = replacementFor(i.id); return r.length ? `<span class="link-chip repl" data-goto-wish="${esc(r[0].id)}" title="Planlagt erstatning">↪ ${esc(r[0].type)}</span>` : ""; };
const invPad = (d) => 14 + d * 22;

// Tre-rader (tabell) – komponent med deler er utvidbar; like blad-søsken grupperes ×N.
function invTreeRows(siblings, depth) {
  let html = ""; const seen = new Set();
  for (const i of siblings) {
    const kids = invChildren(i.id);
    if (kids.length) {
      const open = !!state.expandedNodes[i.id];
      html += `<tr class="click parentrow" data-togglenode="${i.id}"><td style="padding-left:${invPad(depth)}px;font-weight:700">${open ? "▾" : "▸"} ${esc(i.type)} <span class="count">${kids.length} deler</span> ${invRepl(i)} <span class="link-chip" data-add-child="${i.id}">+ del</span> <span class="link-chip" data-edit-inv="${i.id}">✎</span></td>${invCells(i)}</tr>`;
      if (open) html += invTreeRows(kids, depth + 1);
    } else {
      const k = groupKey(i); if (seen.has(k)) continue; seen.add(k);
      const grp = siblings.filter((x) => !invChildren(x.id).length && groupKey(x) === k);
      if (grp.length === 1) {
        html += `<tr class="click" data-edit-inv="${i.id}"><td style="padding-left:${invPad(depth)}px;font-weight:${depth ? 600 : 700}">${esc(i.type)} ${invRepl(i)}</td>${invCells(i)}</tr>`;
      } else {
        const gk = (i.parent_id || "") + "|" + k; const open = !!state.expandedGroups[gk]; const ek = encodeURIComponent(gk);
        html += `<tr class="click grouprow" data-togglegroup="${ek}"><td style="padding-left:${invPad(depth)}px;font-weight:700">${open ? "▾" : "▸"} ${esc(i.type)} <span class="count">×${grp.length}</span></td>${invCells(i)}</tr>`;
        if (open) html += grp.map((it) => `<tr class="click child" data-edit-inv="${it.id}"><td style="padding-left:${invPad(depth + 1)}px">${esc(it.type)} ${invRepl(it)}</td>${invCells(it)}</tr>`).join("");
      }
    }
  }
  return html;
}
// Tre-kort (mobil)
function invTreeCards(siblings, depth) {
  return siblings.map((i) => {
    const kids = invChildren(i.id); const open = !!state.expandedNodes[i.id];
    if (!kids.length) return `<div class="card click" data-edit-inv="${i.id}" style="margin-left:${depth * 12}px">
      <div class="row1"><div><div class="type">${esc(i.type)}</div><div class="meta">${[esc(i.brand), esc(i.size), esc(i.category)].filter(Boolean).join(" · ")}</div></div><span class="tag ${i.status}">${STATUS_LABEL[i.status]}</span></div>
      ${i.notes ? `<div class="note">${esc(i.notes)}</div>` : ""}${replacementFor(i.id).length ? `<div class="chiprow">${invRepl(i)}</div>` : ""}</div>`;
    return `<div class="card" style="margin-left:${depth * 12}px">
      <div class="row1 click" data-togglenode="${i.id}"><div><div class="type">${open ? "▾" : "▸"} ${esc(i.type)} <span class="count">${kids.length} deler</span></div><div class="meta">${esc(i.category)}</div></div><span class="tag ${i.status}">${STATUS_LABEL[i.status]}</span></div>
      <div class="chiprow"><span class="link-chip" data-add-child="${i.id}">+ del</span><span class="link-chip" data-edit-inv="${i.id}">✎ Rediger</span></div>
      ${open ? invTreeCards(kids, depth + 1) : ""}</div>`;
  }).join("");
}

function viewOversikt() {
  const all = state.inventory.filter((i) => !i.retired_at);   // aktivt utstyr
  const retired = state.inventory.filter((i) => i.retired_at);
  if (state.retiredView) return viewRetired(retired);
  const s = {
    total: all.length, ok: all.filter((i) => i.status === "ok").length,
    redusert: all.filter((i) => i.status === "redusert").length,
    ødelagt: all.filter((i) => i.status === "ødelagt").length,
    dårlig: all.filter((i) => i.quality === "dårlig").length,
  };
  const flat = anyFilter();   // filter aktivt → flat liste; ellers tre
  let rows = "", cards = "";

  if (flat) {
    const filtered = all.filter(passesFilters);
    const groups = []; const gmap = new Map();
    for (const i of filtered) { const k = groupKey(i); if (!gmap.has(k)) { gmap.set(k, []); groups.push(k); } gmap.get(k).push(i); }
    const bc = (i) => { const p = invPath(i); return p.length ? `<span class="bc">${esc(p.join(" › "))} › </span>` : ""; };
    rows = groups.map((k) => {
      const g = gmap.get(k); const i = g[0];
      if (g.length === 1) return `<tr class="click" data-edit-inv="${i.id}"><td style="font-weight:700">${bc(i)}${esc(i.type)} ${invRepl(i)}</td>${invCells(i)}</tr>`;
      const open = !!state.expandedGroups[k]; const ek = encodeURIComponent(k);
      return `<tr class="click grouprow" data-togglegroup="${ek}"><td style="font-weight:700">${open ? "▾" : "▸"} ${esc(i.type)} <span class="count">×${g.length}</span></td>${invCells(i)}</tr>
        ${open ? g.map((it) => `<tr class="click child" data-edit-inv="${it.id}"><td style="padding-left:30px">${bc(it)}${esc(it.type)}</td>${invCells(it)}</tr>`).join("") : ""}`;
    }).join("");
    cards = filtered.map((i) => `<div class="card click" data-edit-inv="${i.id}">
      <div class="row1"><div><div class="type">${esc(i.type)}</div><div class="meta">${invPath(i).length ? esc(invPath(i).join(" › ")) + " · " : ""}${[esc(i.brand), esc(i.size), esc(i.category)].filter(Boolean).join(" · ")}</div></div><span class="tag ${i.status}">${STATUS_LABEL[i.status]}</span></div>
      ${i.notes ? `<div class="note">${esc(i.notes)}</div>` : ""}</div>`).join("");
  } else {
    rows = invTreeRows(invRoots(), 0);
    cards = invTreeCards(invRoots(), 0);
  }

  return `
    <div class="stats">
      <div class="stat click ${!anyFilter() ? "on" : ""}" data-stat="all"><b>${s.total}</b><span>Totalt</span></div>
      <div class="stat click ${statActive("status", "ok") ? "on" : ""}" data-stat="status:ok"><b style="color:var(--ok)">${s.ok}</b><span>OK</span></div>
      <div class="stat click ${statActive("status", "redusert") ? "on" : ""}" data-stat="status:redusert"><b style="color:var(--warn)">${s.redusert}</b><span>Redusert</span></div>
      <div class="stat click ${statActive("status", "ødelagt") ? "on" : ""}" data-stat="status:ødelagt"><b style="color:var(--bad)">${s.ødelagt}</b><span>Ødelagt</span></div>
      <div class="stat click ${statActive("quality", "dårlig") ? "on" : ""}" data-stat="quality:dårlig"><b style="color:var(--warn)">${s.dårlig}</b><span>Dårlig kval.</span></div>
    </div>
    ${filterBar()}
    ${flat ? "" : `<div class="tree-hint">Klikk en komponent (f.eks. trommesett) for å se delene. Filtrer for å se alt flatt.</div>`}
    <table>
      <thead><tr><th>Type</th><th>Merke</th><th>Størrelse</th><th>Kategori</th><th>Tilstand</th><th>Kvalitet</th><th>Merknader</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" style="color:var(--muted)">Ingen treff.</td></tr>`}</tbody>
    </table>
    <div class="cards">${cards || `<p style="color:var(--muted)">Ingen treff.</p>`}</div>
    ${retired.length ? `<div style="margin:14px 0 0"><button class="btn ghost sm" data-act="toggle-retired">⌫ Utgått utstyr (${retired.length})</button></div>` : ""}`;
}

// Utgått/erstattet utstyr (egen visning, bevart men ute av oversikten).
function viewRetired(retired) {
  return `
    <div class="toolbar"><button class="btn ghost sm" data-act="toggle-retired">← Tilbake til oversikt</button>
      <span class="eyebrow">Utgått / erstattet utstyr</span></div>
    <p style="color:var(--muted);font-size:13px">Utstyr som er erstattet av nyere innkjøp. Tas ikke med i oversikten, men er bevart.</p>
    ${retired.length ? `<table>
      <thead><tr><th>Type</th><th>Merke</th><th>Størrelse</th><th>Kategori</th><th></th></tr></thead>
      <tbody>${retired.map((i) => `<tr>
        <td style="font-weight:700">${esc(i.type)}</td><td style="color:var(--muted)">${esc(i.brand) || "–"}</td>
        <td class="mono">${esc(i.size) || "–"}</td><td><span class="mono">${esc(i.category)}</span></td>
        <td style="text-align:right"><span class="link-chip" data-unretire="${i.id}">↩ Gjenopprett</span> <span class="link-chip" data-del-inv="${i.id}">Slett</span></td>
      </tr>`).join("")}</tbody></table>`
      : `<p style="color:var(--muted)">Ingenting utgått.</p>`}`;
}

// ── Mangler (med art-kolonne, prisspenn og ekspanderbare alternativer) ──
function viewMangler() {
  const kindChip = (w) => isErstatning(w)
    ? `<span class="tag erstatning" data-goto-inv="${esc(w.replaces_inventory_id)}" title="Erstatter ${esc(inv(w.replaces_inventory_id)?.type || "")}">Erstatning</span>`
    : `<span class="tag mangel">Mangel</span>`;
  const listChips = (w) => listsWith(w.id).map((l) => `<span class="link-chip" data-goto-list="${esc(l.id)}">▤ ${esc(l.name)}</span>`).join("");

  function optionsBlock(w) {
    const opts = w.options || [];
    return `<div class="opts">
      ${opts.length ? opts.map((o) => `<div class="opt">
        <div class="opt-main">
          <b>${esc(o.brand) || "Alternativ"}</b> ${esc(o.model)} ${o.size ? `<span class="opt-size">${esc(o.size)}</span>` : ""}
          ${o.info ? `<div class="opt-info">${esc(o.info)}</div>` : ""}
          <div class="opt-links">${o.link ? `<a href="${esc(o.link)}" target="_blank" rel="noreferrer">🔗 Produkt</a>` : ""}
            <span class="link-chip" data-edit-opt="${w.id}|${o.id}">Rediger</span>
            ${o.link ? `<span class="link-chip" data-priceopt="${o.id}|${esc(o.link)}">⟳ Pris</span>` : ""}
            <span class="link-chip" data-addtolist="${o.id}">+ Til liste</span>
            <span class="link-chip buy" data-buyopt="${w.id}|${o.id}">✓ Kjøpt</span></div>
        </div>
        <div class="opt-price price">${fmt(o.price)}</div>
      </div>`).join("") : `<div class="opt empty">Ingen alternativer ennå. Legg til et konkret produkt for å kunne kjøpe / legge i liste.</div>`}
      <div class="opt-actions">
        <button class="btn ghost sm" data-edit-wish="${w.id}">✎ Rediger mangel (type, prioritet …)</button>
        <button class="btn ghost sm" data-addopt="${w.id}">+ Alternativ</button>
        ${opts.length ? "" : `<button class="btn ghost sm" data-buywish="${w.id}">✓ Marker kjøpt</button>`}
      </div>
    </div>`;
  }

  return `
    <div class="toolbar">
      <span class="eyebrow">Mangler og ønskede oppgraderinger</span>
      <span class="spacer"></span>
      <button class="btn ghost sm" data-act="fetch-prices" title="Henter priser fra lenker">⟳ Hent priser</button>
      <button class="btn" data-act="add-wish">+ Legg til</button>
    </div>
    ${PRIORITIES.map((pri) => {
      const items = state.wishlist.filter((w) => w.priority === pri);
      if (!items.length) return "";
      return `<div class="section-title" style="color:var(--${pri === "høy" ? "bad" : pri === "middels" ? "brass-d" : "muted"})">◆ ${PRI_LABEL[pri]} prioritet <span class="rule"></span></div>
      <table>
        <thead><tr><th></th><th>Type</th><th>Art</th><th>Kategori</th><th>Est. pris</th><th>Koblinger</th></tr></thead>
        <tbody>${items.map((w) => { const open = !!state.expandedWish[w.id]; const n = (w.options || []).length;
          return `<tr class="click" data-togglewish="${w.id}">
            <td style="width:24px;color:var(--faint)">${open ? "▾" : "▸"}</td>
            <td style="font-weight:700">${esc(w.type)}${n ? ` <span class="count">${n} alt.</span>` : ""}</td>
            <td>${kindChip(w)}</td>
            <td><span class="mono">${esc(w.category)}</span></td>
            <td class="price">${priceDisplay(w)}</td>
            <td>${listChips(w)}</td>
          </tr>
          ${open ? `<tr class="exp"><td></td><td colspan="5">${optionsBlock(w)}</td></tr>` : ""}`;
        }).join("")}</tbody>
      </table>
      <div class="cards">${items.map((w) => { const open = !!state.expandedWish[w.id]; const n = (w.options || []).length;
        return `<div class="card">
          <div class="row1 click" data-togglewish="${w.id}">
            <div><div class="type">${open ? "▾" : "▸"} ${esc(w.type)}</div><div class="meta">${kindChip(w)} ${esc(w.category)}${n ? ` · ${n} alt.` : ""}</div></div>
            <span class="price">${priceDisplay(w)}</span>
          </div>
          <div class="chiprow">${listChips(w)}</div>
          ${open ? optionsBlock(w) : `<div class="chiprow" style="margin-top:8px"><span class="link-chip" data-edit-wish="${w.id}">✎ Rediger mangel</span></div>`}
        </div>`;
      }).join("")}</div>`;
    }).join("") || `<p style="color:var(--muted)">Ingen mangler registrert.</p>`}`;
}

// ── Innkjøpslister ──
function viewLister() {
  const active = state.lists.filter((l) => !l.archived_at);
  const archived = state.lists.filter((l) => l.archived_at);
  if (state.listArchive) return viewListArchive(archived);
  return `
    <div class="toolbar"><span class="eyebrow">Innkjøpslister</span><span class="spacer"></span>
      ${archived.length ? `<button class="btn ghost sm" data-act="toggle-archive">📁 Kjøpt/arkiv (${archived.length})</button>` : ""}
      <button class="btn" data-act="add-list">+ Ny liste</button></div>
    ${active.length ? `<div class="lists-grid">${active.map(listCard).join("")}</div>`
      : `<p style="color:var(--muted)">Ingen aktive lister. Lag én, og legg inn mangler du vil kjøpe sammen.</p>`}
    <div class="grand"><div><div class="label">Sum alle mangler (overordnet)</div></div><div class="val">${fmt(manglerTotal())}</div></div>`;
}
function viewListArchive(archived) {
  return `
    <div class="toolbar"><button class="btn ghost sm" data-act="toggle-archive">← Tilbake</button>
      <span class="eyebrow">Kjøpt / arkiverte lister</span></div>
    ${archived.length ? `<div class="lists-grid">${archived.map((l) => `<div class="list-card" style="opacity:.85">
      <div class="head"><h3>${esc(l.name)}</h3>
        <div class="sum" style="color:var(--ok)">✓ Kjøpt${l.archived_at ? " · " + esc(String(l.archived_at).slice(0, 10)) : ""}</div>
        ${l.notes ? `<div style="font-size:12px;color:var(--muted);margin-top:6px">${esc(l.notes)}</div>` : ""}</div>
      <div class="foot"><span style="flex:1;color:var(--muted);font-size:12px">Produktene ligger nå i inventar.</span>
        <span class="link-chip" data-unarchive="${l.id}">↩ Gjenåpne</span>
        <button class="btn danger sm" data-del-list="${l.id}">Slett</button></div>
    </div>`).join("")}</div>` : `<p style="color:var(--muted)">Ingen arkiverte lister.</p>`}`;
}
function listCard(l) {
  const sum = listSum(l);
  // Hver linje ER et produkt (option); mangelen er tilbake-ref.
  const items = (l.items || []).map((it) => ({ it, o: optionById(it.option_id), w: wish(it.wishlist_id) })).filter((x) => x.o);
  const pct = l.budget ? Math.min(100, (sum / l.budget) * 100) : 0;
  return `<div class="list-card">
    <div class="head">
      <div style="display:flex;align-items:center;gap:8px"><h3 style="flex:1">${esc(l.name)}</h3><span class="link-chip" data-edit-list="${l.id}">Rediger</span></div>
      <div class="sum">Sum: <b>${fmt(sum)}</b>${l.budget ? ` <span style="color:var(--faint)">/ ${fmt(l.budget)}</span>` : ""}</div>
      ${l.budget ? `<div class="budget-bar ${sum > l.budget ? "over" : ""}"><i style="width:${pct}%"></i></div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">${sum <= l.budget ? "Gjenstår " + fmt(l.budget - sum) : "Over med " + fmt(sum - l.budget)}</div>` : ""}
      ${l.notes ? `<div style="font-size:12px;color:var(--muted);margin-top:6px">${esc(l.notes)}</div>` : ""}
    </div>
    <div class="body">
      ${items.length ? items.map(({ it, o, w }) => `<div class="li">
          ${w ? `<span class="tag ${w.priority}" style="font-size:10px">${PRI_LABEL[w.priority]}</span>` : ""}
          <div style="flex:1;min-width:0" class="click" data-li-edit="${w ? w.id : ""}">
            <div class="li-prod">${esc(optionName(o))}${o.link ? ` <a href="${esc(o.link)}" target="_blank" rel="noreferrer" data-stoplink>🔗</a>` : ""}</div>
            <div class="li-ref">↳ ${w ? esc(w.type) : "mangel fjernet"}</div>
          </div>
          <span class="price">${fmt((o.price || 0) * (it.qty || 1))}</span>
          <span class="x" data-rmitem="${l.id}|${o.id}" title="Fjern">✕</span>
        </div>`).join("") : `<div class="empty">Tom – legg til produkter (alternativer fra mangler).</div>`}
    </div>
    <div class="foot">
      <button class="btn ghost sm" data-add-items="${l.id}">+ Legg til varer</button>
      <button class="btn ghost sm" data-export-list="${l.id}">⬇ Eksporter</button>
      ${items.length ? `<button class="btn brass sm" data-buy-list="${l.id}">✓ Marker kjøpt</button>` : ""}
      <span style="flex:1"></span>
      <button class="btn danger sm" data-del-list="${l.id}">Slett</button>
    </div>
  </div>`;
}

// ── Merker (godkjente/foretrukne merker) ──
function viewMerker() {
  const cats = [...new Set(state.brands.map((b) => b.category))];
  const order = BRAND_CATS.filter((c) => cats.includes(c)).concat(cats.filter((c) => !BRAND_CATS.includes(c)));
  return `
    <div class="toolbar">
      <span class="eyebrow">Godkjente merker</span>
      <span style="color:var(--muted);font-size:13px">Foretrukne leverandører</span>
      <span class="spacer"></span>
      <button class="btn" data-act="add-brand">+ Nytt merke</button>
    </div>
    ${state.brands.length ? order.map((cat) => `
      <div class="section-title">${cat} <span class="rule"></span></div>
      <div class="brand-grid">
        ${state.brands.filter((b) => b.category === cat).map((b) => `<div class="brand-card click" data-edit-brand="${b.id}">
          <div class="brand-name">${esc(b.name)}</div>
          ${b.notes ? `<div class="brand-notes">${esc(b.notes)}</div>` : `<div class="brand-notes" style="color:var(--faint)">Foretrukket innen ${esc(cat).toLowerCase()}</div>`}
        </div>`).join("")}
      </div>`).join("")
    : `<p style="color:var(--muted)">Ingen merker registrert ennå.</p>`}`;
}

// ── Generér oversikt ──
function viewGenerer() {
  const minS = state.ovMinStatus, minQ = state.ovMinQuality;
  const pass = (i) => (minS === "Alle" || STATUS_RANK[i.status] >= STATUS_RANK[minS]) && (minQ === "Alle" || QUALITY_RANK[i.quality] >= QUALITY_RANK[minQ]);
  // Kun toppnivå – deler/underdeler (f.eks. enkelttrommer i et sett) tas ikke med.
  const included = state.inventory.filter((i) => (!i.parent_id || !inv(i.parent_id)) && pass(i));
  const date = new Date().toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
  const sel = (label, key, val, opts) => `<div class="field"><label>${label}</label><select data-ov="${key}">${opts.map((o) => `<option value="${o[0]}" ${val === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")}</select></div>`;
  const cats = CATEGORIES.filter((c) => included.some((i) => i.category === c));
  return `
    <div class="gen-controls">
      ${sel("Minste tilstand", "status", minS, [["Alle", "Alle"], ["ødelagt", "Min. ødelagt"], ["redusert", "Min. redusert"], ["ok", "Kun OK"]])}
      ${sel("Minste kvalitet", "quality", minQ, [["Alle", "Alle"], ["dårlig", "Min. dårlig"], ["greit", "Min. greit"], ["bra", "Kun bra"]])}
      <div style="flex:1"></div>
      <button class="btn ghost sm" data-act="copy-report">⧉ Kopier</button>
      <button class="btn ghost sm" data-act="print-report">⎙ Skriv ut</button>
      <button class="btn brass" data-act="download-report">⬇ Last ned</button>
    </div>
    <div class="report" id="report">
      <div class="report-head">
        <div>
          <h2>Slagverksoversikt Randaberg Musikkorps</h2>
          <div class="date">Sist oppdatert: ${date}</div>
        </div>
        <img class="report-logo" src="/randaberg-logo-red.png" alt="Randaberg Musikkorps" onerror="this.style.display='none'" />
      </div>
      <div class="grid2">
        ${cats.map((c) => {
          const groups = []; const gm = new Map();
          included.filter((i) => i.category === c).forEach((i) => {
            const k = [i.type, i.brand, i.model, i.size].join("|");
            if (!gm.has(k)) { gm.set(k, { i, n: 0 }); groups.push(k); }
            gm.get(k).n++;
          });
          return `<div class="cat"><h4>${c}</h4>
            ${groups.map((k) => { const { i, n } = gm.get(k); const det = [i.brand, i.model, i.size].filter(Boolean).join(" · ");
              return `<div class="item"><span>${esc(i.type)}${n > 1 ? ` <span class="cnt">×${n}</span>` : ""}</span><span class="det">${esc(det)}</span></div>`; }).join("")}
          </div>`;
        }).join("")}
      </div>
      <div class="footer-note"><b>NB:</b> Randaberg Musikkorps jobber med å oppgradere slagverkutstyret. Lista inneholder utstyr med varierende standard. Alt som er oppgitt er fullt mulig å bruke, men kan være slitt / av lavere kvalitet. Ta gjerne kontakt på jorgen.jarnes@gmail.com ved spørsmål om utstyret.</div>
    </div>`;
}
function reportText() {
  const minS = state.ovMinStatus, minQ = state.ovMinQuality;
  const pass = (i) => (minS === "Alle" || STATUS_RANK[i.status] >= STATUS_RANK[minS]) && (minQ === "Alle" || QUALITY_RANK[i.quality] >= QUALITY_RANK[minQ]);
  const included = state.inventory.filter((i) => (!i.parent_id || !inv(i.parent_id)) && pass(i));
  let out = `Slagverksoversikt Randaberg Musikkorps\nSist oppdatert: ${new Date().toLocaleDateString("nb-NO")}\n`;
  CATEGORIES.forEach((c) => {
    const items = included.filter((i) => i.category === c); if (!items.length) return;
    const groups = []; const gm = new Map();
    items.forEach((i) => { const k = [i.type, i.brand, i.model, i.size].join("|"); if (!gm.has(k)) { gm.set(k, { i, n: 0 }); groups.push(k); } gm.get(k).n++; });
    out += `\n${c}\n`;
    groups.forEach((k) => { const { i, n } = gm.get(k); const det = [i.brand, i.model, i.size].filter(Boolean).join(" · ");
      out += `  ${i.type}${n > 1 ? ` ×${n}` : ""}${det ? "  –  " + det : ""}\n`; });
  });
  return out;
}

// ── Modal ──
function renderModal() {
  const m = state.modal;
  if (m.kind === "list-form") return modalListForm(m);
  if (m.kind === "list-items") return modalListItems(m);
  if (m.kind === "brand-form") return modalBrandForm(m);
  if (m.kind === "option-form") return modalOptionForm(m);
  if (m.kind === "choose-list") return modalChooseList(m);
  return modalEntity(m);
}
function modalEntity(m) {
  const { kind, item } = m;
  const isInv = kind.includes("inv");
  const isNew = kind.startsWith("add");
  const title = isInv ? (isNew ? "Legg til utstyr" : "Rediger utstyr") : (isNew ? "Legg til mangel" : "Rediger mangel");
  const txt = (label, key, type = "text") => `<div class="field"><label>${label}</label><input data-f="${key}" type="${type}" value="${esc(item[key] ?? "")}" /></div>`;
  const sel = (label, key, opts) => `<div class="field"><label>${label}</label><select data-f="${key}">${opts.map((o) => `<option ${item[key] === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
  const brandList = `<datalist id="brandlist">${state.brands.map((b) => `<option value="${esc(b.name)}">`).join("")}</datalist>`;
  const invReplaceOpts = state.inventory.filter((i) => i.quality === "dårlig" || i.status !== "ok");
  const parentOpts = (() => {
    const skip = new Set([item.id, ...(item.id ? invDescendants(item.id) : [])]);
    return state.inventory.filter((p) => !skip.has(p.id));
  })();
  const body = isInv ? `
    ${txt("Type", "type")}
    <div class="field"><label>Merke</label><input data-f="brand" list="brandlist" value="${esc(item.brand ?? "")}" />${brandList}</div>
    ${txt("Modell", "model")}${txt("Størrelse", "size")}
    ${sel("Kategori", "category", CATEGORIES)}${sel("Tilstand", "status", STATUSES)}${sel("Kvalitet", "quality", QUALITIES)}
    ${txt("Merknader", "notes")}
    <div class="field"><label>Del av (komponent, valgfritt)</label><select data-f="parent_id">
      <option value="">– ingen (toppnivå) –</option>
      ${parentOpts.map((p) => `<option value="${esc(p.id)}" ${item.parent_id === p.id ? "selected" : ""}>${esc(invPath(p).concat(p.type).join(" › "))}</option>`).join("")}
    </select></div>` : `
    ${txt("Type", "type")}${sel("Kategori", "category", CATEGORIES)}${sel("Prioritet", "priority", PRIORITIES)}
    ${txt("Estimert pris (kr)", "estimated_price", "number")}${txt("Link", "link")}${txt("Merknader", "notes")}
    <div class="field"><label>Erstatter (utstyr i dårlig stand)</label><select data-f="replaces_inventory_id">
      <option value="">– ingen (vanlig mangel) –</option>
      ${invReplaceOpts.map((i) => `<option value="${esc(i.id)}" ${item.replaces_inventory_id === i.id ? "selected" : ""}>${esc(i.type)} (${i.quality}/${STATUS_LABEL[i.status]})</option>`).join("")}
    </select></div>`;
  return `<div class="modal-bg" data-act="close-modal"><div class="modal" data-stop>
    <h3>${esc(title)}</h3>${body}
    <div class="actions">${!isNew ? `<button class="btn danger" data-act="del">Slett</button>` : ""}<span class="spacer"></span>
      <button class="btn ghost" data-act="close-modal">Avbryt</button><button class="btn" data-act="save">Lagre</button></div>
  </div></div>`;
}
function modalListForm(m) {
  const item = m.item, isNew = !item.id;
  return `<div class="modal-bg" data-act="close-modal"><div class="modal" data-stop>
    <h3>${isNew ? "Ny innkjøpsliste" : "Rediger liste"}</h3>
    <div class="field"><label>Navn</label><input data-f="name" value="${esc(item.name ?? "")}" placeholder="f.eks. NM 2026" /></div>
    <div class="field"><label>Budsjett (kr, valgfritt)</label><input data-f="budget" type="number" value="${item.budget ?? ""}" /></div>
    <div class="field"><label>Notat</label><input data-f="notes" value="${esc(item.notes ?? "")}" /></div>
    <div class="actions">${!isNew ? `<button class="btn danger" data-del-list="${item.id}">Slett</button>` : ""}<span class="spacer"></span>
      <button class="btn ghost" data-act="close-modal">Avbryt</button><button class="btn" data-act="save-list">Lagre</button></div>
  </div></div>`;
}
function modalListItems(m) {
  const l = byId(state.lists, m.listId); if (!l) { state.modal = null; return ""; }
  const inList = new Set((l.items || []).map((it) => it.option_id));
  // Velg PRODUKTER (alternativer). Hver mangel viser sine alternativer; haker man av
  // legges DET produktet i lista. Mangler uten alternativ kan ikke legges til.
  return `<div class="modal-bg" data-act="close-modal"><div class="modal" data-stop>
    <h3>Produkter i «${esc(l.name)}»</h3>
    <p style="color:var(--muted);font-size:12.5px;margin:0 0 10px">En liste inneholder konkrete produkter. Huk av alternativene som skal kjøpes.</p>
    <div class="picklist">${state.wishlist.map((w) => {
      const opts = w.options || [];
      const head = `<div class="pick-mangel">${esc(w.type)} <span style="color:var(--faint);font-size:11px">${esc(w.category)}</span></div>`;
      if (!opts.length) return head + `<div class="pick-empty">Ingen alternativ ennå – legg til et i Mangler-fanen først.</div>`;
      return head + opts.map((o) => `<label class="pick-opt"><input type="checkbox" data-toggleitem="${l.id}|${o.id}" ${inList.has(o.id) ? "checked" : ""}>
        <span style="flex:1;min-width:0">${esc(optionName(o))}</span>
        <span class="price">${fmt(o.price)}</span></label>`).join("");
    }).join("")}</div>
    <div class="actions"><span class="spacer"></span><button class="btn" data-act="close-modal">Ferdig</button></div>
  </div></div>`;
}
function modalBrandForm(m) {
  const item = m.item, isNew = !item.id;
  return `<div class="modal-bg" data-act="close-modal"><div class="modal" data-stop>
    <h3>${isNew ? "Nytt godkjent merke" : "Rediger merke"}</h3>
    <div class="field"><label>Navn</label><input data-f="name" value="${esc(item.name ?? "")}" placeholder="f.eks. Adams" /></div>
    <div class="field"><label>Foretrukket innen</label><select data-f="category">${BRAND_CATS.map((c) => `<option ${item.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
    <div class="field"><label>Notat</label><input data-f="notes" value="${esc(item.notes ?? "")}" placeholder="hva merket er bra på" /></div>
    <div class="actions">${!isNew ? `<button class="btn danger" data-act="del-brand">Slett</button>` : ""}<span class="spacer"></span>
      <button class="btn ghost" data-act="close-modal">Avbryt</button><button class="btn" data-act="save-brand">Lagre</button></div>
  </div></div>`;
}
function modalOptionForm(m) {
  const item = m.item, isNew = !item.id;
  const txt = (label, key, type = "text") => `<div class="field"><label>${label}</label><input data-f="${key}" type="${type}" value="${esc(item[key] ?? "")}" ${key === "brand" ? 'list="brandlist"' : ""} /></div>`;
  return `<div class="modal-bg" data-act="close-modal"><div class="modal" data-stop>
    <h3>${isNew ? "Nytt alternativ" : "Rediger alternativ"}</h3>
    <datalist id="brandlist">${state.brands.map((b) => `<option value="${esc(b.name)}">`).join("")}</datalist>
    ${txt("Produsent / merke", "brand")}${txt("Modell", "model")}${txt("Størrelse", "size")}
    ${txt("Annen info", "info")}${txt("Link til produkt", "link")}${txt("Pris (kr)", "price", "number")}
    <div class="actions">${!isNew ? `<button class="btn danger" data-act="del-opt">Slett</button>` : ""}<span class="spacer"></span>
      <button class="btn ghost" data-act="close-modal">Avbryt</button><button class="btn" data-act="save-opt">Lagre</button></div>
  </div></div>`;
}
function modalChooseList(m) {
  const o = optionById(m.optionId); const active = state.lists.filter((l) => !l.archived_at);
  return `<div class="modal-bg" data-act="close-modal"><div class="modal" data-stop>
    <h3>Legg «${esc(optionName(o))}» i liste</h3>
    ${active.length ? `<div class="picklist">${active.map((l) => `<label data-choose-list="${l.id}"><span style="flex:1">${esc(l.name)}</span><span class="price">${fmt(listSum(l))}</span></label>`).join("")}</div>`
      : `<p style="color:var(--muted)">Du har ingen lister ennå.</p>`}
    <div class="actions"><button class="btn ghost sm" data-act="add-list">+ Ny liste</button><span class="spacer"></span><button class="btn ghost" data-act="close-modal">Lukk</button></div>
  </div></div>`;
}

// ── Docket AI-chat ──
function renderDock() {
  const open = state.chatOpen;
  return `
    <div class="dock ${open ? "open" : ""}" id="dock">
      <div class="dock-bar" data-act="open-chat">
        ${logo(26, "red")}
        <span class="ph">Spør assistenten – «legg til en Sabian-cymbal i god stand» …</span>
        <span class="pill">AI</span>
      </div>
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
    </div>
    <div class="dock-scrim ${open ? "show" : ""}" data-act="close-chat"></div>`;
}

// ── Event wiring ──
function wire() {
  const q = (sel) => root.querySelectorAll(sel);
  q("[data-tab]").forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; state.modal = null; state.openFilter = null; render(); });
  q("[data-ov]").forEach((s) => s.onchange = () => { state["ovMin" + s.dataset.ov[0].toUpperCase() + s.dataset.ov.slice(1)] = s.value; render(); });

  // Filtre
  q("[data-filter]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); state.openFilter = state.openFilter === b.dataset.filter ? null : b.dataset.filter; render(); });
  q("[data-facet]").forEach((cb) => cb.onchange = () => {
    const [key, val] = splitFirst(cb.dataset.facet); const arr = state.filters[key];
    const i = arr.indexOf(val); if (i >= 0) arr.splice(i, 1); else arr.push(val); render();
  });
  q("[data-clearfacet]").forEach((b) => b.onclick = () => { state.filters[b.dataset.clearfacet] = []; render(); });
  // Statistikk-kortene fungerer som hurtigfiltre (toggle).
  q("[data-stat]").forEach((el) => el.onclick = () => {
    const v = el.dataset.stat;
    if (v === "all") { state.filters = { category: [], status: [], quality: [], brand: [] }; }
    else { const [facet, val] = splitFirst(v.replace(":", "|")); state.filters[facet] = statActive(facet, val) ? [] : [val]; }
    render();
  });

  q("[data-edit-inv]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openModal({ kind: "edit-inv", item: { ...inv(el.dataset.editInv) } }); });
  q("[data-edit-wish]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openModal({ kind: "edit-wish", item: { ...wish(el.dataset.editWish) } }); });
  q("[data-togglegroup]").forEach((el) => el.onclick = () => { const k = decodeURIComponent(el.dataset.togglegroup); state.expandedGroups[k] = !state.expandedGroups[k]; render(); });
  q("[data-togglenode]").forEach((el) => el.onclick = (e) => { if (e.target.closest("[data-edit-inv],[data-add-child],[data-goto-wish]")) return; const id = el.dataset.togglenode; state.expandedNodes[id] = !state.expandedNodes[id]; render(); });
  q("[data-add-child]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const par = inv(el.dataset.addChild); openModal({ kind: "add-inv", item: { type: "", brand: "", model: "", size: "", category: par ? par.category : "Trommer", status: "ok", quality: "ukjent", notes: "", parent_id: el.dataset.addChild } }); });
  q("[data-togglewish]").forEach((el) => el.onclick = (e) => { if (e.target.closest("[data-edit-wish],[data-goto-inv]")) return; state.expandedWish[el.dataset.togglewish] = !state.expandedWish[el.dataset.togglewish]; render(); });

  // Alternativer (options)
  q("[data-addopt]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openModal({ kind: "option-form", wishId: el.dataset.addopt, item: { brand: "", model: "", size: "", info: "", link: "", price: "" } }); });
  q("[data-edit-opt]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const [wid, oid] = splitFirst(el.dataset.editOpt); const w = wish(wid); const o = (w.options || []).find((x) => x.id === oid); openModal({ kind: "option-form", wishId: wid, item: { ...o } }); });
  q("[data-priceopt]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const [oid, link] = splitFirst(el.dataset.priceopt); fetchPriceUrl(link, (p) => api(`/options/${oid}`, { method: "PUT", body: JSON.stringify({ price: p }) })); });
  q("[data-addtolist]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openModal({ kind: "choose-list", optionId: el.dataset.addtolist }); });

  q("[data-goto-wish]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); state.tab = "mangler"; render(); });
  q("[data-goto-inv]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); state.tab = "oversikt"; render(); });
  q("[data-goto-list]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); state.tab = "lister"; render(); });

  // Lister
  q("[data-edit-list]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); openModal({ kind: "list-form", item: { ...byId(state.lists, el.dataset.editList) } }); });
  q("[data-add-items]").forEach((el) => el.onclick = () => openModal({ kind: "list-items", listId: el.dataset.addItems }));
  q("[data-export-list]").forEach((el) => el.onclick = () => exportListCSV(byId(state.lists, el.dataset.exportList)));
  q("[data-del-list]").forEach((el) => el.onclick = () => { if (confirm("Slette listen?")) deleteList(el.dataset.delList); });
  q("[data-rmitem]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const [lid, oid] = splitFirst(el.dataset.rmitem); toggleListItem(lid, oid, false); });
  // Oppfyllelse / arkiv
  q("[data-buyopt]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); const [wid, oid] = splitFirst(el.dataset.buyopt); fulfillWish(wid, oid); });
  q("[data-buywish]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); fulfillWish(el.dataset.buywish, null); });
  q("[data-buy-list]").forEach((el) => el.onclick = () => fulfillListBuy(el.dataset.buyList));
  q("[data-unretire]").forEach((el) => el.onclick = () => setRetired(el.dataset.unretire, false));
  q("[data-del-inv]").forEach((el) => el.onclick = () => { if (confirm("Slette utgått utstyr permanent?")) deleteInventory(el.dataset.delInv); });
  q("[data-unarchive]").forEach((el) => el.onclick = () => setArchived(el.dataset.unarchive, false));
  q("[data-li-edit]").forEach((el) => el.onclick = (e) => { if (!el.dataset.liEdit || e.target.closest("[data-rmitem],a,[data-stoplink]")) return; openModal({ kind: "edit-wish", item: { ...wish(el.dataset.liEdit) } }); });
  q("[data-toggleitem]").forEach((cb) => cb.onchange = () => { const [lid, oid] = splitFirst(cb.dataset.toggleitem); toggleListItem(lid, oid, cb.checked); });
  q("[data-choose-list]").forEach((el) => el.onclick = () => addToListChosen(el.dataset.chooseList, state.modal.optionId));

  // Merker
  q("[data-edit-brand]").forEach((el) => el.onclick = () => openModal({ kind: "brand-form", item: { ...byId(state.brands, el.dataset.editBrand) } }));

  const chatInput = root.querySelector("#chatInput");
  if (chatInput && state.chatOpen) { chatInput.onkeydown = (e) => { if (e.key === "Enter") sendChat(chatInput.value); }; if (!state.chatBusy) chatInput.focus(); const log = root.querySelector("#chatLog"); if (log) log.scrollTop = log.scrollHeight; }

  q("[data-act]").forEach((el) => el.onclick = (e) => {
    const act = el.dataset.act;
    const A = {
      logout, "export-all": exportExcelAll, "fetch-prices": fetchAllPrices,
      "add-inv": () => openModal({ kind: "add-inv", item: { type: "", brand: "", model: "", size: "", category: "Trommer", status: "ok", quality: "ukjent", notes: "", parent_id: "" } }),
      "add-wish": () => openModal({ kind: "add-wish", item: { type: "", category: "Trommer", priority: "middels", estimated_price: "", link: "", notes: "", replaces_inventory_id: "" } }),
      "add-list": () => openModal({ kind: "list-form", item: { name: "", budget: "", notes: "" } }),
      "add-brand": () => openModal({ kind: "brand-form", item: { name: "", category: "Generelt", notes: "" } }),
      "open-filtersheet": () => { state.filterSheet = true; render(); },
      "close-filtersheet": () => { state.filterSheet = false; render(); },
      "clear-filters": () => { state.filters = { category: [], status: [], quality: [], brand: [] }; render(); },
      "toggle-retired": () => { state.retiredView = !state.retiredView; render(); },
      "toggle-archive": () => { state.listArchive = !state.listArchive; render(); },
      "close-filter": () => { state.openFilter = null; render(); },
      "copy-report": () => { navigator.clipboard.writeText(reportText()); toast("Kopiert"); },
      "print-report": () => window.print(),
      "download-report": () => downloadCSV([[reportText()]], "slagverksoversikt.txt"),
      "open-chat": openChat, "close-chat": closeChat,
      "send-chat": () => sendChat(root.querySelector("#chatInput").value),
    };
    if (A[act]) return A[act]();
    if (act === "close-modal") { if (e.target.hasAttribute("data-stop")) return; state.modal = null; return render(); }
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
function readFields() { const data = {}; document.querySelectorAll(".modal [data-f]").forEach((el) => { data[el.dataset.f] = el.value; }); return data; }
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
// touch-action: pan-y (CSS) lar nettleser scrolle vertikalt; vi fanger horisontalt.
// Retnings-lås + høy terskel (~25% bredde) hindrer utløsning ved uhell.
function initSwipeNav() {
  const TAB_KEYS = TABS.map((t) => t[0]);
  let sx = 0, sy = 0, dx = 0, dy = 0, active = false, locked = false, mainEl = null, fromIdx = 0;
  const LOCK = 12;

  const blocked = (t) =>
    !state.code || state.chatOpen || state.modal || state.filterSheet || state.openFilter ||
    window.innerWidth > 720 ||
    (t.closest && t.closest("nav.tabs, #dock, .dock-scrim, .modal-bg, .filter-pop, select, input, textarea, a, button, [data-stop]"));

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
      if (Math.abs(dy) >= Math.abs(dx)) { active = false; return; } // vertikalt → la scroll skje
      locked = true;
    }
    // Demp ved endene (ingen fane å gå til)
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
    const dir = dx < 0 ? 1 : -1;                  // 1 = neste, -1 = forrige
    const target = fromIdx + dir;
    if (Math.abs(dx) >= threshold && target >= 0 && target < TAB_KEYS.length) {
      const W = window.innerWidth;
      mainEl.style.transition = "transform .16s ease, opacity .16s ease";
      mainEl.style.transform = `translateX(${dir === 1 ? -W : W}px)`;  // sklid gammel ut
      mainEl.style.opacity = "0";
      const el = mainEl;
      setTimeout(() => {
        if (root.querySelector("main") === el) { /* uendret */ }
        state.tab = TAB_KEYS[target]; state.modal = null; state.openFilter = null;
        state.retiredView = false; state.listArchive = false;
        swipeIn = dir; render();
      }, 150);
    } else {
      resetMain(true);
    }
  }, { passive: true });
}

// ── Boot ──
initGlobalListeners();
initSwipeNav();
(async function boot() {
  if (state.code) { try { await loadAll(); } catch { logout(); } }
  else render();
})();
