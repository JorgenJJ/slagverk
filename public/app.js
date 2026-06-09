// ── Slagverk Inventar – frontend (buildless vanilla JS) ──

const CATEGORIES = ["Trommer", "Melodisk", "Pauker", "Cymbaler", "Stativer", "Perkusjon"];
const PRIORITIES = ["høy", "middels", "lav"];
const STATUSES = ["ok", "redusert", "ødelagt"];
const QUALITIES = ["bra", "greit", "dårlig", "ukjent"];
const PRI_LABEL = { høy: "Høy", middels: "Middels", lav: "Lav" };
const STATUS_LABEL = { ok: "OK", redusert: "Redusert", ødelagt: "Ødelagt" };

const state = {
  code: sessionStorage.getItem("slagverk_code") || "",
  tab: "oversikt",
  inventory: [],
  wishlist: [],
  catFilter: "Alle",
  statusFilter: "Alle",
  budget: "",
  modal: null,        // { kind, item }
  chat: [],
  chatBusy: false,
};

const root = document.getElementById("root");
const fmt = (n) => (n ? Number(n).toLocaleString("nb-NO") + " kr" : "–");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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
  [state.inventory, state.wishlist] = await Promise.all([api("/inventory"), api("/wishlist")]);
  render();
}

// ── Auth ──
async function login(code) {
  state.code = code;
  await api("/login", { method: "POST" });
  sessionStorage.setItem("slagverk_code", code);
  await loadAll();
}
function logout() {
  state.code = "";
  sessionStorage.removeItem("slagverk_code");
  render();
}

// ── Toast ──
let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

// ── Export ──
function exportExcel() {
  const wb = XLSX.utils.book_new();
  const inv = state.inventory.map((i) => ({
    ID: i.id, Type: i.type, Merke: i.brand, Kategori: i.category,
    Status: STATUS_LABEL[i.status] || i.status, Kvalitet: i.quality, Merknader: i.notes,
  }));
  const wish = state.wishlist.map((w) => ({
    Type: w.type, Kategori: w.category, Prioritet: PRI_LABEL[w.priority] || w.priority,
    "Estimert pris": w.estimated_price || "", Budsjettert: w.budgeted ? "Ja" : "Nei",
    Link: w.link, Merknader: w.notes,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inv), "Inventar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wish), "Mangler");
  XLSX.writeFile(wb, "slagverk-inventar.xlsx");
  toast("Eksportert til Excel");
}
function exportCSV() {
  const rows = [["ID", "Type", "Merke", "Kategori", "Status", "Kvalitet", "Merknader"]];
  state.inventory.forEach((i) => rows.push([i.id, i.type, i.brand, i.category, i.status, i.quality, i.notes]));
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "slagverk-inventar.csv"; a.click();
  toast("Eksportert til CSV");
}

// ── Mutations ──
async function saveInventory(item, isNew) {
  if (isNew) await api("/inventory", { method: "POST", body: JSON.stringify(item) });
  else await api("/inventory/" + item.id, { method: "PUT", body: JSON.stringify(item) });
  state.modal = null; await loadAll(); toast("Lagret");
}
async function deleteInventory(id) {
  await api("/inventory/" + id, { method: "DELETE" });
  state.modal = null; await loadAll(); toast("Slettet");
}
async function saveWish(item, isNew) {
  const payload = { ...item, estimated_price: item.estimated_price === "" ? null : Number(item.estimated_price) };
  if (isNew) await api("/wishlist", { method: "POST", body: JSON.stringify(payload) });
  else await api("/wishlist/" + item.id, { method: "PUT", body: JSON.stringify(payload) });
  state.modal = null; await loadAll(); toast("Lagret");
}
async function deleteWish(id) {
  await api("/wishlist/" + id, { method: "DELETE" });
  state.modal = null; await loadAll(); toast("Slettet");
}
async function toggleBudgeted(w) {
  await api("/wishlist/" + w.id, { method: "PUT", body: JSON.stringify({ budgeted: !w.budgeted }) });
  await loadAll();
}

// ── Chat (v2) ──
async function sendChat(text) {
  if (!text.trim() || state.chatBusy) return;
  state.chat.push({ role: "user", content: text });
  state.chatBusy = true; render();
  try {
    const r = await api("/chat", { method: "POST", body: JSON.stringify({ messages: state.chat }) });
    state.chat.push({ role: "assistant", content: r.reply });
  } catch (e) {
    state.chat.push({ role: "assistant", content: "Feil: " + e.message });
  }
  state.chatBusy = false; render();
}

// ── Rendering ──
function render() {
  if (!state.code) return renderLogin();
  root.innerHTML = `
    ${header()}
    <main>${
      state.tab === "oversikt" ? viewOversikt()
      : state.tab === "ønskeliste" ? viewWishlist()
      : state.tab === "innkjøp" ? viewInnkjop()
      : viewChat()
    }</main>
    ${state.modal ? renderModal() : ""}
  `;
  wire();
}

function renderLogin() {
  root.innerHTML = `
    <div class="login-wrap"><div class="login-card">
      <div class="drum">🥁</div>
      <h1>Slagverk Inventar</h1>
      <p>Randaberg Musikkorps</p>
      <div class="field"><input id="code" type="password" placeholder="Tilgangskode" autofocus /></div>
      <button class="btn" id="loginBtn" style="width:100%">Logg inn</button>
      <p id="loginErr" style="color:var(--bad);margin-top:14px;display:none">Feil kode</p>
    </div></div>`;
  const go = async () => {
    try { await login(document.getElementById("code").value); }
    catch { document.getElementById("loginErr").style.display = "block"; }
  };
  document.getElementById("loginBtn").onclick = go;
  document.getElementById("code").onkeydown = (e) => { if (e.key === "Enter") go(); };
}

function header() {
  const tabs = [["oversikt", "Oversikt"], ["ønskeliste", "Mangler"], ["innkjøp", "Innkjøp"], ["chat", "AI-chat"]];
  return `<header>
    <div class="brand">
      <div class="badge-drum">🥁</div>
      <div><h1>Slagverk Inventar</h1><small>Randaberg Musikkorps</small></div>
      <button class="logout" data-act="logout">Logg ut</button>
    </div>
    <nav>${tabs.map(([k, l]) => `<button class="${state.tab === k ? "active" : ""}" data-tab="${k}">${l}</button>`).join("")}</nav>
  </header>`;
}

function viewOversikt() {
  const inv = state.inventory;
  const s = {
    total: inv.length,
    ok: inv.filter((i) => i.status === "ok").length,
    redusert: inv.filter((i) => i.status === "redusert").length,
    ødelagt: inv.filter((i) => i.status === "ødelagt").length,
    dårlig: inv.filter((i) => i.quality === "dårlig").length,
  };
  const filtered = inv.filter((i) =>
    (state.catFilter === "Alle" || i.category === state.catFilter) &&
    (state.statusFilter === "Alle" || i.status === state.statusFilter));

  return `
    <div class="stats">
      <div class="stat"><b>${s.total}</b><span>Totalt</span></div>
      <div class="stat"><b style="color:var(--ok)">${s.ok}</b><span>OK</span></div>
      <div class="stat"><b style="color:var(--warn)">${s.redusert}</b><span>Redusert</span></div>
      <div class="stat"><b style="color:var(--bad)">${s.ødelagt}</b><span>Ødelagt</span></div>
      <div class="stat"><b style="color:var(--warn)">${s.dårlig}</b><span>Dårlig kval.</span></div>
    </div>
    <div class="toolbar">
      <div class="chips">
        ${["Alle", ...CATEGORIES].map((c) => `<button class="chip ${state.catFilter === c ? "on" : ""}" data-cat="${c}">${c}</button>`).join("")}
        ${STATUSES.map((st) => `<button class="chip ${state.statusFilter === st ? "on" : ""}" data-status="${st}">${STATUS_LABEL[st]}</button>`).join("")}
      </div>
      <span class="spacer"></span>
      <button class="btn" data-act="add-inv">+ Legg til</button>
    </div>
    <table>
      <thead><tr><th>ID</th><th>Type</th><th>Merke</th><th>Kategori</th><th>Status</th><th>Kvalitet</th><th>Merknader</th></tr></thead>
      <tbody>${filtered.map((i) => `
        <tr class="click" data-edit-inv="${i.id}">
          <td style="color:var(--faint);font-size:11px">${esc(i.id)}</td>
          <td style="font-weight:700;color:#f1f5f9">${esc(i.type)}</td>
          <td style="color:#94a3b8">${esc(i.brand) || "–"}</td>
          <td style="color:var(--muted);font-size:11px">${esc(i.category)}</td>
          <td><span class="tag ${i.status}">${STATUS_LABEL[i.status]}</span></td>
          <td class="q-${i.quality}" style="font-weight:600">${esc(i.quality)}</td>
          <td style="color:var(--muted);font-size:11px">${esc(i.notes) || "–"}</td>
        </tr>`).join("")}</tbody>
    </table>
    <div class="cards">${filtered.map((i) => `
      <div class="card click" data-edit-inv="${i.id}">
        <div class="row1">
          <div><div class="type">${esc(i.type)}</div><div class="meta">${esc(i.brand) || ""} ${esc(i.category)}</div></div>
          <span class="tag ${i.status}">${STATUS_LABEL[i.status]}</span>
        </div>
        <div class="meta">Kvalitet: <span class="q-${i.quality}">${esc(i.quality)}</span></div>
        ${i.notes ? `<div class="note">${esc(i.notes)}</div>` : ""}
      </div>`).join("")}</div>`;
}

function viewWishlist() {
  return `
    <div class="toolbar">
      <div class="section-title" style="margin:0">Mangler og ønskede oppgraderinger</div>
      <span class="spacer"></span>
      <button class="btn" data-act="add-wish">+ Legg til</button>
    </div>
    ${PRIORITIES.map((pri) => {
      const items = state.wishlist.filter((w) => w.priority === pri);
      if (!items.length) return "";
      return `<div class="section-title" style="color:var(--${pri === "høy" ? "bad" : pri === "middels" ? "gold" : "accent"})">◆ ${PRI_LABEL[pri]} prioritet</div>
      <table>
        <thead><tr><th>Type</th><th>Kategori</th><th>Est. pris</th><th>Merknader</th></tr></thead>
        <tbody>${items.map((w) => `
          <tr class="click" data-edit-wish="${w.id}">
            <td style="font-weight:700;color:#f1f5f9">${esc(w.type)}</td>
            <td style="color:var(--muted);font-size:11px">${esc(w.category)}</td>
            <td style="color:var(--gold);font-weight:600">${fmt(w.estimated_price)}</td>
            <td style="color:var(--muted);font-size:11px">${esc(w.notes) || "–"}</td>
          </tr>`).join("")}</tbody>
      </table>
      <div class="cards">${items.map((w) => `
        <div class="card click" data-edit-wish="${w.id}">
          <div class="row1"><div class="type">${esc(w.type)}</div><span style="color:var(--gold);font-weight:700">${fmt(w.estimated_price)}</span></div>
          <div class="meta">${esc(w.category)}</div>
          ${w.notes ? `<div class="note">${esc(w.notes)}</div>` : ""}
        </div>`).join("")}</div>`;
    }).join("")}`;
}

function viewInnkjop() {
  const budgeted = state.wishlist.filter((w) => w.budgeted).reduce((a, w) => a + (w.estimated_price || 0), 0);
  const all = state.wishlist.reduce((a, w) => a + (w.estimated_price || 0), 0);
  const bn = parseFloat(String(state.budget).replace(/\s/g, "").replace(",", ".")) || 0;
  const pct = bn ? (budgeted / bn) * 100 : 0;
  const sorted = [...state.wishlist].sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));

  return `
    <div class="section-title">Budsjett og innkjøpsplan</div>
    <div class="budget">
      <label>Tilgjengelig budsjett (kr)</label>
      <input id="budget" type="text" value="${esc(state.budget)}" placeholder="f.eks. 100000" />
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:14px">
        <span>Budsjettert: <b style="color:#f1f5f9">${fmt(budgeted)}</b></span>
        <span>Totalt alt: <b style="color:#f1f5f9">${fmt(all)}</b></span>
      </div>
      ${bn ? `<div class="bar ${budgeted > bn ? "over" : ""}"><i style="width:${Math.min(pct, 100)}%"></i></div>
        <div style="font-size:11px;color:var(--muted)">${budgeted <= bn ? "Gjenstår: " + fmt(bn - budgeted) : `<span style="color:var(--bad)">Overbudsjett med ${fmt(budgeted - bn)}</span>`}</div>` : ""}
    </div>
    <div class="toolbar">
      <div class="section-title" style="margin:0">Merk hva som skal kjøpes inn</div>
      <span class="spacer"></span>
      <button class="btn ghost" data-act="csv">CSV</button>
      <button class="btn" data-act="excel">Excel</button>
    </div>
    <table>
      <thead><tr><th>✓</th><th>Type</th><th>Prioritet</th><th>Est. pris</th><th>Link</th></tr></thead>
      <tbody>${sorted.map((w) => `
        <tr>
          <td><input type="checkbox" data-budget="${w.id}" ${w.budgeted ? "checked" : ""} style="accent-color:var(--accent);width:16px;height:16px"></td>
          <td style="font-weight:700;color:${w.budgeted ? "#93c5fd" : "#f1f5f9"}">${esc(w.type)}</td>
          <td><span class="tag ${w.priority}">${PRI_LABEL[w.priority]}</span></td>
          <td style="color:var(--gold);font-weight:600">${fmt(w.estimated_price)}</td>
          <td>${w.link ? `<a href="${esc(w.link)}" target="_blank" rel="noreferrer">🔗 Åpne</a>` : "<span style='color:var(--faint)'>–</span>"}</td>
        </tr>`).join("")}</tbody>
    </table>
    <div class="cards">${sorted.map((w) => `
      <div class="card">
        <div class="row1">
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-budget="${w.id}" ${w.budgeted ? "checked" : ""} style="accent-color:var(--accent);width:16px;height:16px"><span class="type">${esc(w.type)}</span></label>
          <span class="tag ${w.priority}">${PRI_LABEL[w.priority]}</span>
        </div>
        <div class="meta">${fmt(w.estimated_price)} ${w.link ? `· <a href="${esc(w.link)}" target="_blank">🔗 Åpne</a>` : ""}</div>
      </div>`).join("")}</div>
    <div style="margin-top:20px;padding:16px 20px;background:var(--panel);border:1px solid var(--line);border-radius:10px">
      <div style="font-size:12px;color:var(--muted)">Total kostnad for alle ønskede innkjøp</div>
      <div style="font-size:24px;font-weight:700;color:var(--gold)">${fmt(all)}</div>
    </div>`;
}

function viewChat() {
  return `
    <div class="section-title">AI-assistent</div>
    <div class="chat-log" id="chatlog">
      ${state.chat.length === 0 ? `<div class="msg ai"><div class="bubble">Hei! Jeg kan hjelpe med å legge inn utstyr, oppdatere status eller finne info. (Aktiveres når AI_API_KEY er satt i Cloudflare.)</div></div>` : ""}
      ${state.chat.map((m) => `<div class="msg ${m.role === "user" ? "user" : "ai"}"><div class="bubble">${esc(m.content)}</div></div>`).join("")}
      ${state.chatBusy ? `<div class="msg ai"><div class="bubble">…</div></div>` : ""}
    </div>
    <div class="chat-input">
      <input id="chatInput" placeholder="Skriv en melding…" ${state.chatBusy ? "disabled" : ""} />
      <button class="btn" data-act="send-chat">Send</button>
    </div>`;
}

function renderModal() {
  const { kind, item } = state.modal;
  const isInv = kind.includes("inv");
  const isNew = kind.startsWith("add");
  const title = isInv ? (isNew ? "Legg til utstyr" : "Rediger – " + item.id) : (isNew ? "Legg til ønske" : "Rediger – " + item.type);

  const txt = (label, key) => `<div class="field"><label>${label}</label><input data-f="${key}" value="${esc(item[key] ?? "")}" /></div>`;
  const sel = (label, key, opts) => `<div class="field"><label>${label}</label><select data-f="${key}">${opts.map((o) => `<option ${item[key] === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;

  const body = isInv ? `
    ${txt("Type", "type")}${txt("Merke", "brand")}
    ${sel("Kategori", "category", CATEGORIES)}
    ${sel("Status", "status", STATUSES)}
    ${sel("Kvalitet", "quality", QUALITIES)}
    ${txt("Merknader", "notes")}` : `
    ${txt("Type", "type")}
    ${sel("Kategori", "category", CATEGORIES)}
    ${sel("Prioritet", "priority", PRIORITIES)}
    <div class="field"><label>Estimert pris (kr)</label><input data-f="estimated_price" type="number" value="${item.estimated_price ?? ""}" /></div>
    ${txt("Link", "link")}${txt("Merknader", "notes")}`;

  return `<div class="modal-bg" data-act="close-modal"><div class="modal" data-stop>
    <h3>${esc(title)}</h3>${body}
    <div class="actions">
      ${!isNew ? `<button class="btn danger" data-act="del">Slett</button>` : ""}
      <button class="btn ghost" data-act="close-modal">Avbryt</button>
      <button class="btn" data-act="save">Lagre</button>
    </div>
  </div></div>`;
}

// ── Event wiring ──
function wire() {
  root.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { state.tab = b.dataset.tab; render(); });
  root.querySelectorAll("[data-cat]").forEach((b) => b.onclick = () => { state.catFilter = b.dataset.cat; render(); });
  root.querySelectorAll("[data-status]").forEach((b) => b.onclick = () => { state.statusFilter = state.statusFilter === b.dataset.status ? "Alle" : b.dataset.status; render(); });
  root.querySelectorAll("[data-edit-inv]").forEach((el) => el.onclick = () => { state.modal = { kind: "edit-inv", item: { ...state.inventory.find((i) => i.id === el.dataset.editInv) } }; render(); });
  root.querySelectorAll("[data-edit-wish]").forEach((el) => el.onclick = () => { state.modal = { kind: "edit-wish", item: { ...state.wishlist.find((w) => w.id === el.dataset.editWish) } }; render(); });
  root.querySelectorAll("[data-budget]").forEach((cb) => cb.onchange = () => toggleBudgeted(state.wishlist.find((w) => w.id === cb.dataset.budget)));

  const bud = root.querySelector("#budget");
  if (bud) {
    bud.oninput = () => { state.budget = bud.value; };
    bud.onblur = () => render();
    bud.onkeydown = (e) => { if (e.key === "Enter") bud.blur(); };
  }

  const chatInput = root.querySelector("#chatInput");
  if (chatInput) { chatInput.onkeydown = (e) => { if (e.key === "Enter") { sendChat(chatInput.value); } }; chatInput.focus(); const log = root.querySelector("#chatlog"); if (log) log.scrollTop = log.scrollHeight; }

  root.querySelectorAll("[data-act]").forEach((el) => el.onclick = (e) => {
    const act = el.dataset.act;
    if (act === "logout") return logout();
    if (act === "excel") return exportExcel();
    if (act === "csv") return exportCSV();
    if (act === "add-inv") { state.modal = { kind: "add-inv", item: { type: "", brand: "", category: "Trommer", status: "ok", quality: "ukjent", notes: "" } }; return render(); }
    if (act === "add-wish") { state.modal = { kind: "add-wish", item: { type: "", category: "Trommer", priority: "middels", estimated_price: "", link: "", notes: "" } }; return render(); }
    if (act === "close-modal") { if (e.target.hasAttribute("data-stop")) return; state.modal = null; return render(); }
    if (act === "send-chat") return sendChat(root.querySelector("#chatInput").value);
    if (act === "save" || act === "del") return modalAction(act);
  });
  root.querySelectorAll("[data-stop]").forEach((el) => el.onclick = (e) => e.stopPropagation());
}

function modalAction(act) {
  const m = state.modal; if (!m) return;
  const data = { ...m.item };
  document.querySelectorAll(".modal [data-f]").forEach((el) => { data[el.dataset.f] = el.value; });
  const isInv = m.kind.includes("inv");
  const isNew = m.kind.startsWith("add");
  if (act === "del") return isInv ? deleteInventory(data.id) : deleteWish(data.id);
  if (!data.type) return toast("Type er påkrevd");
  return isInv ? saveInventory(data, isNew) : saveWish(data, isNew);
}

// ── Boot ──
(async function boot() {
  if (state.code) {
    try { await loadAll(); } catch { logout(); }
  } else render();
})();
