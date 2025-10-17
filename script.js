// --- Handlingsplan script.js (Hybrid CSV + DB, force-refresh) ---

// Config
const CSV_URL_BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTf-bAq0V8H8vLpSSEzpf18GPcW7ZROEK-MMNvy99Mbz3Be8EQ63By7hGofAg5R2Od7KUYtr95w23JO/pub?output=csv";
const API_BASE = "https://handlingsplan-backend.onrender.com";
const SUGG_API = API_BASE + "/api/suggestions";
const POLL_MS = 10000;

// Column order (ID is intentionally omitted from display)
const COLS = [
  "Hva vil du gjøre?",
  "Velg et tema",
  "Velg et punkt (nr)",
  "Formuler punktet",
  "Endre fra",
  "Endre til",
];

// State
let suggestions = []; // [{ suggestion_id, payload } ...] from CSV
let statuses = {};    // { suggestion_id: 'vedtatt' | 'ny' }
let currentIndex = 0;

// DOM
const track = document.getElementById("carousel-track");
const isMobile = window.innerWidth <= 600;
if (isMobile && track) track.classList.add("stacked");

// Helpers
function fallbackIdFromRow(row) {
  const parts = COLS.map(k => row[k] || "").join("|");
  let h = 5381;
  for (let i = 0; i < parts.length; i++) h = ((h << 5) + h) ^ parts.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function withSilentUI(fn) {
  document.documentElement.classList.add("silent-update");
  try { fn(); } finally {
    requestAnimationFrame(() => document.documentElement.classList.remove("silent-update"));
  }
}

// Load CSV fresh (cache-busted) and normalize rows
async function loadCSVFresh() {
  const csvUrl = CSV_URL_BASE + (CSV_URL_BASE.includes("?") ? "&" : "?") + "ts=" + Date.now();
  const res = await fetch(csvUrl, { cache: "no-store" });
  if (!res.ok) throw new Error("CSV fetch failed: " + res.status);
  const text = await res.text();

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = (results.data || []).map((row) => {
            const id = (row["ID"] || "").toString().trim() || fallbackIdFromRow(row);
            return { suggestion_id: id, payload: row };
          });
          resolve(rows);
        } catch (e) { reject(e); }
      },
      error: reject,
    });
  });
}

// Fetch DB statuses
async function loadStatuses() {
  const res = await fetch(SUGG_API + "?cacheBust=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("Status fetch failed: " + (await res.text()));
  const data = await res.json();
  return Object.fromEntries((data.items || []).map((it) => [it.suggestion_id, it.status]));
}

// Ensure all IDs from CSV exist in DB (idempotent)
async function ensureIdsExist() {
  if (!suggestions.length) return;
  const token = localStorage.getItem("token");
  const items = suggestions.map(s => ({
    suggestion_id: s.suggestion_id,
    status: statuses[s.suggestion_id] || "ny",
    // payload not needed in DB; we keep content in CSV
    payload: {},
    updated_by: "frontend"
  }));

  const chunkSize = 200;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const res = await fetch(SUGG_API + "/upsert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ items: chunk }),
    });
    if (!res.ok) {
      console.warn("UPSERT chunk failed", res.status, await res.text());
    }
  }
}

// Render the merged view
function render() {
  if (!track) return;
  withSilentUI(() => {
    track.innerHTML = "";

    if (!suggestions.length) {
      track.innerHTML = "<p>Ingen forslag funnet.</p>";
      return;
    }

    const grouped = {};
    for (const s of suggestions) {
      const tema = s.payload["Velg et tema"] || "Uten tema";
      (grouped[tema] ||= []).push(s);
    }

    const temaOrder = [
      "Ungdomsdemokrati og Medvirkning",
      "Samferdsel",
      "Utdanning og Kompetanse",
      "Folkehelse",
      "Klima og Miljø",
      "Kultur",
    ];

    for (const tema of temaOrder) {
      const group = grouped[tema];
      if (!group) continue;

      const slide = document.createElement("div");
      slide.className = "carousel-slide";

      const h2 = document.createElement("h2");
      h2.textContent = tema;
      slide.appendChild(h2);

      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      for (const label of COLS) {
        const th = document.createElement("th");
        th.textContent = label;
        headerRow.appendChild(th);
      }
      headerRow.appendChild(document.createElement("th")); // actions
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      // Sort by punkt (nr) then by action type
      const order = { "Legge til et punkt": 0, "Endre et punkt": 1, "Fjerne et punkt": 2 };
      group.sort((a, b) => {
        const pa = a.payload, pb = b.payload;
        const nA = parseInt(pa["Velg et punkt (nr)"]) || 0;
        const nB = parseInt(pb["Velg et punkt (nr)"]) || 0;
        if (nA !== nB) return nA - nB;
        const oA = order[pa["Hva vil du gjøre?"]] ?? 99;
        const oB = order[pb["Hva vil du gjøre?"]] ?? 99;
        return oA - oB;
      });

      for (const s of group) {
        const tr = document.createElement("tr");
        const id = s.suggestion_id;
        const status = statuses[id] || "ny";
        const payload = s.payload || {};

        for (const key of COLS) {
          const td = document.createElement("td");
          td.textContent = payload[key] ?? "";
          tr.appendChild(td);
        }

        const tdAction = document.createElement("td");
        const btn = document.createElement("button");
        btn.textContent = status === "vedtatt" ? "Vedtatt" : "Vedta";
        btn.className = "vedta-button";
        if (status === "vedtatt") {
          tr.classList.add("vedtatt");
          btn.classList.add("vedtatt");
        }
        btn.onclick = () => handleVedtaClick(tr, btn, id);
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      slide.appendChild(table);
      track.appendChild(slide);
    }

    updateCarousel();
  });
}

// Carousel controls
function updateCarousel() {
  const slides = track.children.length;
  if (slides === 0) return;
  currentIndex = (currentIndex + slides) % slides;
  track.style.transform = `translateX(-${currentIndex * 100}%)`;
}
function nextSlide() { currentIndex++; updateCarousel(); }
function prevSlide() { currentIndex--; updateCarousel(); }

// Force-refresh loop: fetch CSV + DB each time, then full re-render
async function refreshAll() {
  try {
    const [csvRows, dbStatuses] = await Promise.all([loadCSVFresh(), loadStatuses()]);
    suggestions = csvRows;
    statuses = dbStatuses;
    await ensureIdsExist(); // keep DB aware of all IDs
    render();
  } catch (err) {
    console.error("refreshAll failed:", err);
  }
}

// Main
window.addEventListener("DOMContentLoaded", async () => {
  await refreshAll();
  setInterval(refreshAll, POLL_MS);
});

// Login overlay behavior
const loginOverlayEl = document.getElementById("login-section");
if (loginOverlayEl) {
  loginOverlayEl.addEventListener("click", function (event) {
    const loginBox = document.querySelector(".login-box");
    if (loginBox && !loginBox.contains(event.target)) {
      this.style.display = "none";
      const loginBtn = document.getElementById("login-button");
      if (loginBtn) loginBtn.style.display = "inline-block";
    }
  });
}

// Export controls globally (if buttons exist in HTML)
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
