// ===========================
// VinylRoll - script.js (v3)
// ===========================

const STORAGE_KEY = "vinylroll_v3"; // bump pour forcer refresh
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Elements
const tabs = $$(".tab");
const search = $("#search");
const sortByEl = $("#sortBy");
const sortDirEl = $("#sortDir");
const listEl = $("#list");
const addSection = $("#add");
const randomSection = $("#random");
const artistsList = $("#artistsList");

const state = {
  items: [],
  tab: "library",
  search: "",
  sortBy: "artist", // artist | album | year | state | type
  sortDir: "asc", // asc | desc
};

// ---------- Persistence ----------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.items = raw ? JSON.parse(raw) : [];
  } catch {
    state.items = [];
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}
function updateItem(id, patch) {
  const idx = state.items.findIndex((x) => x.id === id);
  if (idx === -1) return;
  state.items[idx] = { ...state.items[idx], ...patch };
  save();
  render();
}

// ---------- Tabs ----------
function setTab(id) {
  state.tab = id;
  tabs.forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  addSection.classList.toggle("hidden", id !== "add");
  randomSection.classList.toggle("hidden", id !== "random");
  $("#controls").classList.toggle("hidden", id === "add");
  render();
}
tabs.forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

// ---------- Add item ----------
$("#addBtn").onclick = async () => {
  const artist = $("#artist").value.trim();
  const album = $("#album").value.trim();
  if (!artist || !album) {
    alert("Artiste et album, c’est pas optionnel.");
    return;
  }

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
    limitedDetail: type === "limited" ? limitedDetail || null : null,
    state: stateSel,
    comment: comment || null,
    coverUrl: null,
  };

  state.items.unshift(it);
  save();

  // refresh datalist artistes
  populateArtistsDatalist();

  // Essai auto pour récupérer la cover
  try {
    await fetchCover(it.id);
  } catch {}

  // reset champs
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
  const blob = new Blob([JSON.stringify(state.items, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vinylroll.json";
  a.click();
  URL.revokeObjectURL(url);
};

$("#importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error("Format invalide");

    state.items = arr
      .map((x) => ({
        id:
          x.id ||
          (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
        artist: String(x.artist || "").trim(),
        album: String(x.album || "").trim(),
        year: Number.isFinite(x.year) ? x.year : x.year === null ? null : null,
        type: x.type === "limited" ? "limited" : "standard",
        limitedDetail:
          x.type === "limited"
            ? x.limitedDetail
              ? String(x.limitedDetail)
              : null
            : null,
        state: ["owned", "preorder", "wishlist"].includes(x.state)
          ? x.state
          : "owned",
        comment: x.comment ? String(x.comment) : null,
        coverUrl: x.coverUrl || null,
      }))
      .filter((x) => x.artist && x.album);

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
    state.items = [];
    save();
    populateArtistsDatalist();
    render();
  }
};

// ---------- Search + Sort ----------
search.oninput = () => {
  state.search = search.value.toLowerCase();
  render();
};
sortByEl.onchange = () => {
  state.sortBy = sortByEl.value;
  render();
};
sortDirEl.onchange = () => {
  state.sortDir = sortDirEl.value;
  render();
};

function compare(a, b, by) {
  const dir = state.sortDir === "asc" ? 1 : -1;
  const S = (s) => (s ?? "").toString().toLowerCase();

  if (by === "year") {
    const ay = a.year ?? -Infinity;
    const byy = b.year ?? -Infinity;
    if (ay === byy) return S(a.artist).localeCompare(S(b.artist)) * dir; // tiebreak
    return (ay < byy ? -1 : 1) * dir;
  }
  if (by === "artist")
    return (
      S(a.artist).localeCompare(S(b.artist)) * dir ||
      S(a.album).localeCompare(S(b.album)) * dir
    );
  if (by === "album")
    return (
      S(a.album).localeCompare(S(b.album)) * dir ||
      S(a.artist).localeCompare(S(b.artist)) * dir
    );
  if (by === "state")
    return (
      S(a.state).localeCompare(S(b.state)) * dir ||
      S(a.artist).localeCompare(S(b.artist)) * dir
    );
  if (by === "type")
    return (
      S(a.type).localeCompare(S(b.type)) * dir ||
      S(a.artist).localeCompare(S(b.artist)) * dir
    );
  return 0;
}

// ---------- Render ----------
function render() {
  // sync UI selects
  sortByEl.value = state.sortBy;
  sortDirEl.value = state.sortDir;

  const q = state.search.trim().toLowerCase();

  let items = state.items.filter((it) => {
    if (state.tab === "library" && it.state !== "owned") return false;
    if (state.tab === "wishlist" && it.state !== "wishlist") return false;
    if (!q) return true;
    return (
      it.artist.toLowerCase().includes(q) ||
      it.album.toLowerCase().includes(q) ||
      (it.limitedDetail || "").toLowerCase().includes(q) ||
      (it.comment || "").toLowerCase().includes(q)
    );
  });

  items.sort((a, b) => compare(a, b, state.sortBy));

  listEl.innerHTML =
    state.tab === "library" || state.tab === "wishlist"
      ? items.map(renderCard).join("")
      : "";

  if (state.tab === "random") {
    const ownedCount = state.items.filter((x) => x.state === "owned").length;
    if (ownedCount === 0) {
      $(
        "#pick"
      ).innerHTML = `<span class="muted">Ajoute au moins un vinyle en « owned » pour brasser la roulette.</span>`;
    }
  }
}

function renderCard(it) {
  const meta = [
    it.type === "limited"
      ? `Édition limitée${
          it.limitedDetail ? ": " + escapeHtml(it.limitedDetail) : ""
        }`
      : "Standard",
    it.state,
  ]
    .filter(Boolean)
    .join(" • ");

  const cover = it.coverUrl
    ? `<img class="cover" src="${escapeAttr(
        it.coverUrl
      )}" alt="Cover ${escapeAttr(it.album)}" loading="lazy">`
    : `<div class="cover" aria-label="Sans cover"></div>`;

  const stateSel = `
    <select class="small" onchange="updateState('${it.id}', this.value)">
      <option value="owned"${
        it.state === "owned" ? " selected" : ""
      }>owned</option>
      <option value="preorder"${
        it.state === "preorder" ? " selected" : ""
      }>preorder</option>
      <option value="wishlist"${
        it.state === "wishlist" ? " selected" : ""
      }>wishlist</option>
    </select>`;

  const typeSel = `
    <select class="small" onchange="updateType('${it.id}', this.value)">
      <option value="standard"${
        it.type === "standard" ? " selected" : ""
      }>standard</option>
      <option value="limited"${
        it.type === "limited" ? " selected" : ""
      }>limited</option>
    </select>`;

  const limitedInput =
    it.type === "limited"
      ? `<input class="small" placeholder="Détail limité" value="${escapeAttr(
          it.limitedDetail || ""
        )}" onblur="updateLimitedDetail('${it.id}', this.value)">`
      : ``;

  const fetchBtn = `<button class="btn ghost small" onclick="fetchCover('${it.id}')">Chercher jaquette</button>`;

  return `
    <div class="card" data-id="${it.id}">
      <div class="item-row">
        ${cover}
        <div class="meta">
          <div style="font-weight:700">${escapeHtml(it.artist)} — ${escapeHtml(
    it.album
  )}${it.year ? ` (${it.year})` : ""}</div>
          <div class="muted">${meta}</div>
          ${
            it.comment
              ? `<div class="muted">${escapeHtml(it.comment)}</div>`
              : ""
          }
        </div>
        <div class="controls">
          ${stateSel}
          ${typeSel}
          ${limitedInput}
          ${fetchBtn}
          <button class="btn danger small" onclick="removeItem('${
            it.id
          }')">Supprimer</button>
        </div>
      </div>
    </div>
  `;
}

// Exposées globalement pour les handlers inline
window.removeItem = (id) => {
  if (!confirm("Supprimer ce vinyle?")) return;
  state.items = state.items.filter((x) => x.id !== id);
  save();
  populateArtistsDatalist();
  render();
};

window.updateState = (id, v) => updateItem(id, { state: v });
window.updateType = (id, v) => {
  const patch = { type: v };
  if (v === "standard") patch.limitedDetail = null;
  updateItem(id, patch);
};
window.updateLimitedDetail = (id, v) =>
  updateItem(id, { limitedDetail: v || null });

// ---------- Random ----------
$("#randomBtn").onclick = () => {
  const owned = state.items.filter((it) => it.state === "owned");
  if (owned.length === 0) {
    $(
      "#pick"
    ).innerHTML = `<span class="muted">Ajoute au moins un vinyle possédé pour brasser la roulette.</span>`;
    return;
  }
  const p = owned[Math.floor(Math.random() * owned.length)];
  $("#pick").innerHTML = `
    <div>
      <div style="font-weight:700">${escapeHtml(p.artist)} — ${escapeHtml(
    p.album
  )}${p.year ? ` (${p.year})` : ""}</div>
      <div class="muted" style="margin-top:4px;">${
        p.type === "limited"
          ? `Édition limitée${
              p.limitedDetail ? ": " + escapeHtml(p.limitedDetail) : ""
            }`
          : "Standard"
      }</div>
      ${
        p.comment
          ? `<div class="muted" style="margin-top:4px;">${escapeHtml(
              p.comment
            )}</div>`
          : ""
      }
    </div>
  `;
};

// ---------- Covers via iTunes Search ----------
async function fetchCover(id) {
  const it = state.items.find((x) => x.id === id);
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
      alert("Aucune jaquette trouvée.");
      return;
    }
    let art = data.results[0].artworkUrl100;
    if (art)
      art = art
        .replace("100x100bb.jpg", "512x512bb.jpg")
        .replace("100x100bb.png", "512x512bb.png");
    updateItem(id, { coverUrl: art || null });
  } catch {
    alert("Impossible de récupérer la jaquette pour le moment.");
  }
}

// ---------- Artists datalist ----------
function populateArtistsDatalist() {
  const names = Array.from(
    new Set(state.items.map((x) => x.artist).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  artistsList.innerHTML = names
    .map((n) => `<option value="${escapeAttr(n)}"></option>`)
    .join("");
}

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}
function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

// ---------- Service Worker registration ----------
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
