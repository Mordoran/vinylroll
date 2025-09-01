// ===========================
// VinylRoll - script.js (v4)
// ===========================

const STORAGE_KEY = "vinylroll_v4"; // bump pour forcer refresh
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

// UI elements
const tabs = $$(".tab");
const search = $("#search");
const sortByEl = $("#sortBy");
const sortDirEl = $("#sortDir");
const listEl = $("#list");
const addSection = $("#add");
const randomSection = $("#random");
const controlsBar = $("#controls");
const artistsList = $("#artistsList");
const fetchAllBtn = $("#fetchAllBtn");

const state = {
  items: [],
  tab: "library",
  search: "",
  sortBy: "artist",   // artist | album | year | state | type
  sortDir: "asc"      // asc | desc
};

// ---------- Persistence ----------
function load() {
  try { state.items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { state.items = []; }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}
function getItem(id) {
  return state.items.find(x => x.id === id);
}
function updateItem(id, patch) {
  const idx = state.items.findIndex(x => x.id === id);
  if (idx === -1) return;
  state.items[idx] = { ...state.items[idx], ...patch };
  save();
  render();
}

// ---------- Tabs ----------
function setTab(id) {
  state.tab = id;
  tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  addSection.classList.toggle("hidden", id !== "add");
  randomSection.classList.toggle("hidden", id !== "random");
  // cacher la barre de recherche/tri dans Ajouter et Random
  controlsBar.classList.toggle("hidden", id === "add" || id === "random");
  render();
}
tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

// ---------- Add item ----------
$("#addBtn").onclick = async () => {
  const artist = $("#artist").value.trim();
  const album = $("#album").value.trim();
  if (!artist || !album) { alert("Artiste et album, c’est pas optionnel."); return; }

  const yearRaw = $("#year").value.trim();
  const year = yearRaw ? parseInt(yearRaw, 10) : null;
  const type = $("#type").value;
  const limitedDetail = $("#limitedDetail").value.trim();
  const stateSel = $("#state").value;
  const comment = $("#comment").value.trim();

  const it = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    artist,
    album,
    year: Number.isFinite(year) ? year : null,
    type,
    limitedDetail: type === "limited" ? (limitedDetail || null) : null,
    state: stateSel,
    comment: comment || null,
    coverUrl: null
  };

  state.items.unshift(it);
  save();

  populateArtistsDatalist();

  try { await fetchCover(it.id); } catch {}

  // reset
  $("#artist").value = "";
  $("#album").value = "";
  $("#year").value = "";
  $("#limitedDetail").value = "";
  $("#comment").value = "";
  $("#type").value = "standard";
  $("#state").value = "owned";

  setTab(stateSel === "wishlist" ? "wishlist" : "library");
};

// ---------- Export / Import / Wipe ----------
$("#exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "vinylroll.json"; a.click();
  URL.revokeObjectURL(url);
};

$("#importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error("Format invalide");
    state.items = arr.map(x => ({
      id: x.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      artist: String(x.artist || "").trim(),
      album: String(x.album || "").trim(),
      year: Number.isFinite(x.year) ? x.year : (x.year === null ? null : null),
      type: x.type === "limited" ? "limited" : "standard",
      limitedDetail: x.type === "limited" ? (x.limitedDetail ? String(x.limitedDetail) : null) : null,
      state: ["owned","preorder","wishlist"].includes(x.state) ? x.state : "owned",
      comment: x.comment ? String(x.comment) : null,
      coverUrl: x.coverUrl || null
    })).filter(x => x.artist && x.album);
    save();
    populateArtistsDatalist();
    render();
    alert("Import réussi.");
  } catch {
    alert("Fichier invalide.");
  } finally {
    e.target.value = "";
  }
};

$("#wipeBtn").onclick = () => {
  if (confirm("Tout effacer? C’est irréversible, comme une rayure profonde.")) {
    state.items = []; save(); populateArtistsDatalist(); render();
  }
};

// ---------- Search + Sort ----------
search.oninput = () => { state.search = search.value.toLowerCase(); render(); };
sortByEl.onchange = () => { state.sortBy = sortByEl.value; render(); };
sortDirEl.onchange = () => { state.sortDir = sortDirEl.value; render(); };

function compare(a, b, by) {
  const dir = state.sortDir === "asc" ? 1 : -1;
  const S = s => (s ?? "").toString().toLowerCase();

  if (by === "year") {
    const ay = a.year ?? -Infinity;
    const byy = b.year ?? -Infinity;
    if (ay === byy) return (S(a.artist).localeCompare(S(b.artist))) * dir;
    return (ay < byy ? -1 : 1) * dir;
  }
  if (by === "artist") return S(a.artist).localeCompare(S(b.artist)) * dir || S(a.album).localeCompare(S(b.album)) * dir;
  if (by === "album")  return S(a.album).localeCompare(S(b.album)) * dir || S(a.artist).localeCompare(S(b.artist)) * dir;
  if (by === "state")  return S(a.state).localeCompare(S(b.state)) * dir || S(a.artist).localeCompare(S(b.artist)) * dir;
  if (by === "type")   return S(a.type).localeCompare(S(b.type)) * dir || S(a.artist).localeCompare(S(b.artist)) * dir;
  return 0;
}

// ---------- Render ----------
function render() {
  // sync selects
  sortByEl.value = state.sortBy;
  sortDirEl.value = state.sortDir;

  const q = state.search.trim().toLowerCase();
  let items = state.items.filter(it => {
    if (state.tab === "library" && it.state !== "owned") return false;
    if (state.tab === "wishlist" && it.state !== "wishlist") return false;
    if (!q) return true;
    return it.artist.toLowerCase().includes(q)
        || it.album.toLowerCase().includes(q)
        || (it.limitedDetail || "").toLowerCase().includes(q)
        || (it.comment || "").toLowerCase().includes(q);
  });

  items.sort((a, b) => compare(a, b, state.sortBy));

  listEl.innerHTML = (state.tab === "library" || state.tab === "wishlist")
    ? items.map(renderCard).join("")
    : "";

  if (state.tab === "random") {
    const owned = state.items.filter(x => x.state === "owned");
    if (owned.length === 0) {
      $("#pick").innerHTML = `<span class="muted">Ajoute au moins un vinyle en « owned » pour brasser la roulette.</span>`;
    }
  }
}

// Présentation compacte + édition cachée
function renderCard(it) {
  const editionLine = it.type === "limited"
    ? `Édition limitée${it.limitedDetail ? ": " + escapeHtml(it.limitedDetail) : ""}`
    : `Standard`;

  const cover = it.coverUrl
    ? `<img class="cover" src="${escapeAttr(it.coverUrl)}" alt="Cover ${escapeAttr(it.album)}" loading="lazy" onclick="toggleControls('${it.id}')">`
    : `<div class="cover" aria-label="Sans cover" onclick="toggleControls('${it.id}')"></div>`;

  return `
    <div class="card" data-id="${it.id}">
      <div class="item">
        ${cover}
        <div class="meta">
          <div class="row-top">${escapeHtml(it.artist)} — ${escapeHtml(it.album)}${it.year ? ` (${it.year})` : ""}</div>
          <div class="row-mid">${editionLine} • ${it.state}</div>
          <div class="row-bottom ${it.comment ? "" : "hidden"}">${escapeHtml(it.comment || "")}</div>
        </div>
      </div>

      <div id="controls-${it.id}" class="controls-line">
        <select class="small" onchange="updateState('${it.id}', this.value)">
          <option value="owned"${it.state === "owned" ? " selected" : ""}>owned</option>
          <option value="preorder"${it.state === "preorder" ? " selected" : ""}>preorder</option>
          <option value="wishlist"${it.state === "wishlist" ? " selected" : ""}>wishlist</option>
        </select>

        <select class="small" onchange="updateType('${it.id}', this.value)">
          <option value="standard"${it.type === "standard" ? " selected" : ""}>standard</option>
          <option value="limited"${it.type === "limited" ? " selected" : ""}>limited</option>
        </select>

        <input class="small ${it.type === 'limited' ? '' : 'hidden'}" id="limited-${it.id}" placeholder="Détail limité"
               value="${escapeAttr(it.limitedDetail || "")}" onblur="updateLimitedDetail('${it.id}', this.value)">

        <button class="btn ghost small" onclick="fetchCover('${it.id}')">Chercher jaquette</button>
        <button class="btn danger small" onclick="removeItem('${it.id}')">Supprimer</button>
      </div>
    </div>
  `;
}

// Toggle affichage des contrôles en cliquant sur la cover
window.toggleControls = (id) => {
  const el = document.getElementById(`controls-${id}`);
  if (!el) return;
  el.classList.toggle("show");
};

// Actions
window.removeItem = (id) => {
  if (!confirm("Supprimer ce vinyle?")) return;
  state.items = state.items.filter(x => x.id !== id);
  save(); populateArtistsDatalist(); render();
};

window.updateState = (id, v) => updateItem(id, { state: v });

window.updateType = (id, v) => {
  const it = getItem(id);
  if (!it) return;
  // Alerte si limited -> standard
  if (it.type === "limited" && v === "standard") {
    const ok = confirm("Passer de « édition limitée » à « standard » va retirer le détail limité. Continuer?");
    if (!ok) { render(); return; }
  }
  const patch = { type: v };
  if (v === "standard") patch.limitedDetail = null;
  updateItem(id, patch);
  // montrer/cacher l'input détail en live
  const input = document.getElementById(`limited-${id}`);
  if (input) input.classList.toggle("hidden", v !== "limited");
};

window.updateLimitedDetail = (id, v) => updateItem(id, { limitedDetail: v || null });

// ---------- Random ----------
$("#randomBtn").onclick = () => {
  const owned = state.items.filter(it => it.state === "owned");
  if (owned.length === 0) {
    $("#pick").innerHTML = `<span class="muted">Ajoute au moins un vinyle possédé pour brasser la roulette.</span>`;
    return;
  }
  const p = owned[Math.floor(Math.random() * owned.length)];
  const editionLine = p.type === "limited"
    ? `Édition limitée${p.limitedDetail ? ": " + escapeHtml(p.limitedDetail) : ""}`
    : `Standard`;

  const cover = p.coverUrl
    ? `<img class="random-cover" src="${escapeAttr(p.coverUrl)}" alt="Cover ${escapeAttr(p.album)}" loading="lazy">`
    : `<div class="random-cover" aria-label="Sans cover"></div>`;

  $("#pick").innerHTML = `
    <div class="random-wrap">
      ${cover}
      <div>
        <div class="row-top">${escapeHtml(p.artist)} — ${escapeHtml(p.album)}${p.year ? ` (${p.year})` : ""}</div>
        <div class="row-mid" style="margin-top:6px;">${editionLine}</div>
        ${p.comment ? `<div class="muted" style="margin-top:6px;">${escapeHtml(p.comment)}</div>` : ""}
      </div>
    </div>
  `;
};

// ---------- Covers ----------
async function fetchCover(id) {
  const it = getItem(id);
  if (!it) return;
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", `${it.artist} ${it.album}`);
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      alert(`Aucune jaquette trouvée pour "${it.artist} — ${it.album}".`);
      return;
    }
    let art = data.results[0].artworkUrl100;
    if (art) art = art.replace("100x100bb.jpg", "512x512bb.jpg").replace("100x100bb.png", "512x512bb.png");
    updateItem(id, { coverUrl: art || null });
  } catch {
    alert("Impossible de récupérer la jaquette pour le moment.");
  }
}

// Bouton pour chercher toutes les jaquettes
fetchAllBtn.onclick = async () => {
  const missing = state.items.filter(x => !x.coverUrl);
  if (missing.length === 0) { alert("Toutes les jaquettes sont déjà présentes. Bravo, maniaque."); return; }

  let ok = confirm(`Chercher les jaquettes manquantes pour ${missing.length} vinyle(s)?`);
  if (!ok) return;

  // boucle simple, une par une
  for (const it of missing) {
    // eslint désactivé dans mon coeur
    // petite pause entre requêtes pour être poli
    // pas de await delay ici, fetch enchaîné c'est correct pour ce cas simple
    try { // eslint-ignore
      // eslint-ignore
      // eslint-ignore
      await fetchCover(it.id);
    } catch {}
  }
  alert("Recherche des jaquettes terminée.");
};

// ---------- Artists datalist ----------
function populateArtistsDatalist() {
  const names = Array.from(new Set(state.items.map(x => x.artist).filter(Boolean)))
    .sort((a,b) => a.localeCompare(b));
  artistsList.innerHTML = names.map(n => `<option value="${escapeAttr(n)}"></option>`).join("");
}

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

// ---------- Service Worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// boot
load();
populateArtistsDatalist();
render();
setTab("library");
