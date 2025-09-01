// ===========================
// VinylRoll - script.js
// ===========================

const STORAGE_KEY = "vinylroll_v1";
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

// Elements
const tabs = $$(".tab");
const search = $("#search");
const listEl = $("#list");
const addSection = $("#add");
const randomSection = $("#random");

const state = {
  items: [],
  tab: "library",
  search: ""
};

// --------- Persistence ---------
function load() {
  try {
    state.items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    state.items = [];
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

// --------- Tabs ---------
function setTab(id) {
  state.tab = id;
  tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  addSection.classList.toggle("hidden", id !== "add");
  randomSection.classList.toggle("hidden", id !== "random");
  search.classList.toggle("hidden", id === "add");
  render();
}
tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

// --------- Add item ---------
$("#addBtn").onclick = () => {
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
    type, // "standard" | "limited"
    limitedDetail: type === "limited" ? (limitedDetail || null) : null,
    state: stateSel, // "owned" | "preorder" | "wishlist"
    comment: comment || null
  };

  state.items.unshift(it);
  save();

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

// --------- Export / Import / Wipe ---------
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
    // nettoyage minimal: garder les champs connus
    state.items = arr.map(x => ({
      id: x.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      artist: String(x.artist || "").trim(),
      album: String(x.album || "").trim(),
      year: Number.isFinite(x.year) ? x.year : null,
      type: x.type === "limited" ? "limited" : "standard",
      limitedDetail: x.limitedDetail ? String(x.limitedDetail) : null,
      state: ["owned","preorder","wishlist"].includes(x.state) ? x.state : "owned",
      comment: x.comment ? String(x.comment) : null
    })).filter(x => x.artist && x.album);
    save(); render();
    alert("Import réussi.");
  } catch {
    alert("Fichier invalide.");
  } finally {
    e.target.value = "";
  }
};

$("#wipeBtn").onclick = () => {
  if (confirm("Tout effacer? C’est irréversible, comme une rayure profonde.")) {
    state.items = []; save(); render();
  }
};

// --------- Search ---------
search.oninput = () => { state.search = search.value.toLowerCase(); render(); };

// --------- Render ---------
function render() {
  const q = state.search.trim().toLowerCase();

  let items = state.items.filter(it => {
    if (state.tab === "library" && it.state !== "owned") return false;
    if (state.tab === "wishlist" && it.state !== "wishlist") return false;
    if (!q) return true;
    return it.artist.toLowerCase().includes(q)
        || it.album.toLowerCase().includes(q)
        || (it.limitedDetail || "").toLowerCase().includes(q)
        || (it.comment || "").toLowerCase().includes(q);
  }).sort((a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album));

  // lister seulement en onglets library/wishlist
  listEl.innerHTML = (state.tab === "library" || state.tab === "wishlist")
    ? items.map(renderCard).join("")
    : "";

  // message aléatoire si rien à tirer
  if (state.tab === "random") {
    const ownedCount = state.items.filter(x => x.state === "owned").length;
    if (ownedCount === 0) {
      $("#pick").innerHTML = `<span class="muted">Ajoute au moins un vinyle en « owned » pour brasser la roulette.</span>`;
    }
  }
}

function renderCard(it) {
  const meta = [
    it.type === "limited" ? `Édition limitée${it.limitedDetail ? ": " + escapeHtml(it.limitedDetail) : ""}` : "Standard",
    it.state
  ].filter(Boolean).join(" • ");

  return `
    <div class="card" data-id="${it.id}">
      <div style="display:flex; justify-content:space-between; gap:8px;">
        <div>
          <div style="font-weight:700">${escapeHtml(it.artist)} — ${escapeHtml(it.album)}${it.year ? ` (${it.year})` : ""}</div>
          <div class="muted" style="margin-top:4px;">${meta}</div>
          ${it.comment ? `<div class="muted" style="margin-top:4px;">${escapeHtml(it.comment)}</div>` : ""}
        </div>
        <div>
          <button class="btn danger" onclick="removeItem('${it.id}')">Supprimer</button>
        </div>
      </div>
    </div>
  `;
}

window.removeItem = (id) => {
  if (!confirm("Supprimer ce vinyle?")) return;
  state.items = state.items.filter(x => x.id !== id);
  save(); render();
};

// --------- Random ---------
$("#randomBtn").onclick = () => {
  const owned = state.items.filter(it => it.state === "owned");
  if (owned.length === 0) {
    $("#pick").innerHTML = `<span class="muted">Ajoute au moins un vinyle possédé pour brasser la roulette.</span>`;
    return;
  }
  const p = owned[Math.floor(Math.random() * owned.length)];
  $("#pick").innerHTML = `
    <div>
      <div style="font-weight:700">${escapeHtml(p.artist)} — ${escapeHtml(p.album)}${p.year ? ` (${p.year})` : ""}</div>
      <div class="muted" style="margin-top:4px;">${p.type === "limited" ? `Édition limitée${p.limitedDetail ? ": " + escapeHtml(p.limitedDetail) : ""}` : "Standard"}</div>
      ${p.comment ? `<div class="muted" style="margin-top:4px;">${escapeHtml(p.comment)}</div>` : ""}
    </div>
  `;
};

// --------- Utils ---------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// --------- Service Worker registration ---------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// boot
load();
render();
setTab("library");
