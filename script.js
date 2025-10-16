// --- Handlingsplan script.js (Hybrid CSV + DB) ---
// Uses Google Sheet for content; PostgreSQL for vedtatt status.
// Columns to display (in this exact order, excluding ID):
// 1) Hva vil du gjøre?
// 2) Velg et tema
// 3) Velg et punkt (nr)
// 4) Formuler punktet
// 5) Endre fra
// 6) Endre til

// --- Config ---
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTf-bAq0V8H8vLpSSEzpf18GPcW7ZROEK-MMNvy99Mbz3Be8EQ63By7hGofAg5R2Od7KUYtr95w23JO/pub?output=csv";
const API_BASE = "https://handlingsplan-backend.onrender.com";
const SUGG_API = API_BASE + "/api/suggestions";

// Column order (ID is intentionally omitted)
const COLS = [
  "Hva vil du gjøre?",
  "Velg et tema",
  "Velg et punkt (nr)",
  "Formuler punktet",
  "Endre fra",
  "Endre til",
];

// --- State ---
let suggestions = []; // from CSV: [{ suggestion_id, payload }, ...]
let statuses = {};    // from DB: { suggestion_id: 'vedtatt' | 'ny' }
let currentIndex = 0;

// --- DOM refs ---
const track = document.getElementById("carousel-track");
const isMobile = window.innerWidth <= 600;
if (isMobile && track) track.classList.add("stacked");

// ---------- Helpers ----------

// Fallback deterministic id from key fields (used only if CSV row lacks ID)
function fallbackIdFromRow(row) {
  const parts = [
    row["Hva vil du gjøre?"] || "",
    row["Velg et tema"] || "",
    row["Velg et punkt (nr)"] || "",
    row["Formuler punktet"] || "",
    row["Endre fra"] || "",
    row["Endre til"] || ""
  ].join("|");
  let h = 5381;
  for (let i = 0; i < parts.length; i++) h = ((h << 5) + h) ^ parts.charCodeAt(i);
  return (h >>> 0).toString(16);
}

// ---------- Vedta click handler ----------
async function handleVedtaClick(tr, btn, suggestionId) {
  const isVedtatt = !tr.classList.contains("vedtatt");
  const token = localStorage.getItem("token");

  // Instant UI feedback
  tr.classList.toggle("vedtatt", isVedtatt);
  btn.classList.toggle("vedtatt", isVedtatt);
  btn.textContent = isVedtatt ? "Vedtatt" : "Vedta";

  // Update local cache
  statuses[suggestionId] = isVedtatt ? "vedtatt" : "ny";

  try {
    const res = await fetch(`${SUGG_API}/${encodeURIComponent(suggestionId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        status: isVedtatt ? "vedtatt" : "ny",
        actor: "admin",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("PATCH /api/suggestions failed", res.status, text);
    }
  } catch (err) {
    console.warn("PATCH /api/suggestions failed:", err);
  }
}

// ---------- Fetch CSV content (read-only source of table content) ----------
async function loadCSV() {
  return new Promise((resolve, reject) => {
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = (results.data || []).map((row) => {
            // Prefer the "ID" column if present; otherwise fallback
            const id = (row["ID"] || "").toString().trim() || fallbackIdFromRow(row);
            return { suggestion_id: id, payload: row };
          });
          suggestions = rows;
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      error: reject,
    });
  });
}

// ---------- Fetch DB statuses (single source of truth for vedtatt) ----------
async function loadStatuses() {
  try {
    const res = await fetch(SUGG_API + "?cacheBust=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    statuses = Object.fromEntries((data.items || []).map((it) => [it.suggestion_id, it.status]));
  } catch (err) {
    console.error("loadStatuses failed:", err);
  }
}

// ---------- Render combined view ----------
function render() {
  if (!track) return;
  track.innerHTML = "";

  if (!suggestions.length) {
    track.innerHTML = "<p>Ingen forslag funnet.</p>";
    return;
  }

  // Group by "Velg et tema"
  const grouped = {};
  for (const s of suggestions) {
    const tema = s.payload["Velg et tema"] || "Uten tema";
    if (!grouped[tema]) grouped[tema] = [];
    grouped[tema].push(s);
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

    // Render headers exactly as requested
    for (const label of COLS) {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.appendChild(th);
    }
    // Extra empty header for the button column
    headerRow.appendChild(document.createElement("th"));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    // Optional: sort inside each tema by "Velg et punkt (nr)" numeric asc, then action
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

      // Data cells in exact order (ID is not shown)
      for (const key of COLS) {
        const td = document.createElement("td");
        td.textContent = payload[key] ?? "";
        tr.appendChild(td);
      }

      // Action cell
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
}

// ---------- Carousel ----------
function updateCarousel() {
  const slides = track.children.length;
  if (slides === 0) return;
  currentIndex = (currentIndex + slides) % slides;
  track.style.transform = `translateX(-${currentIndex * 100}%)`;
}

function nextSlide() { currentIndex++; updateCarousel(); }
function prevSlide() { currentIndex--; updateCarousel(); }

// ---------- Init ----------
async function init() {
  await loadCSV();        // content
  await loadStatuses();   // vedtatt status
  render();

  // Poll only statuses every 10s (no CSV polling → no duplicates)
  setInterval(async () => {
    const before = JSON.stringify(statuses);
    await loadStatuses();
    if (JSON.stringify(statuses) !== before) render();
  }, 10000);
}

window.addEventListener("DOMContentLoaded", init);

// ---------- Login overlay behavior ----------
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
