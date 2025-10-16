// --- Handlingsplan script.js (Hybrid CSV + DB) ---

// --- Config ---
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTf-bAq0V8H8vLpSSEzpf18GPcW7ZROEK-MMNvy99Mbz3Be8EQ63By7hGofAg5R2Od7KUYtr95w23JO/pub?output=csv";
const API_BASE = "https://handlingsplan-backend.onrender.com";
const SUGG_API = API_BASE + "/api/suggestions";

// --- State ---
let suggestions = []; // from CSV
let statuses = {}; // from DB
let currentIndex = 0;

// --- DOM refs ---
const track = document.getElementById("carousel-track");
const isMobile = window.innerWidth <= 600;
if (isMobile && track) track.classList.add("stacked");

// ---------- Vedta click handler ----------
async function handleVedtaClick(tr, btn, suggestionId) {
  const isVedtatt = !tr.classList.contains("vedtatt");
  const token = localStorage.getItem("token");

  tr.classList.toggle("vedtatt", isVedtatt);
  btn.classList.toggle("vedtatt", isVedtatt);
  btn.textContent = isVedtatt ? "Vedtatt" : "Vedta";

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

// ---------- Fetch CSV content ----------
async function loadCSV() {
  return new Promise((resolve, reject) => {
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      complete: (results) => {
        if (!results.data || !results.data.length) {
          reject("Empty CSV");
          return;
        }

        suggestions = results.data.map((row) => {
          const id = row["suggestion_id"]?.trim() || crypto.randomUUID();
          return { suggestion_id: id, payload: row };
        });
        resolve();
      },
      error: reject,
    });
  });
}

// ---------- Fetch DB statuses ----------
async function loadStatuses() {
  try {
    const res = await fetch(SUGG_API + "?cacheBust=" + Date.now(), {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    statuses = Object.fromEntries(
      (data.items || []).map((it) => [it.suggestion_id, it.status])
    );
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
    [
      "Velg et punkt (nr)",
      "Hva vil du gjøre?",
      "Forslag",
      "Begrunnelse",
      "Forslagsstiller",
    ].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      headerRow.appendChild(th);
    });
    headerRow.appendChild(document.createElement("th"));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    for (const s of group) {
      const tr = document.createElement("tr");
      const id = s.suggestion_id;
      const status = statuses[id] || "ny";
      const payload = s.payload;

      ["Velg et punkt (nr)", "Hva vil du gjøre?", "Forslag", "Begrunnelse", "Forslagsstiller"].forEach((h) => {
        const td = document.createElement("td");
        td.textContent = payload[h] || "";
        tr.appendChild(td);
      });

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

function nextSlide() {
  currentIndex++;
  updateCarousel();
}
function prevSlide() {
  currentIndex--;
  updateCarousel();
}

// ---------- Main flow ----------
async function init() {
  await loadCSV();
  await loadStatuses();
  render();

  // Poll only statuses (not CSV) every 10 s
  setInterval(async () => {
    const prevStatuses = { ...statuses };
    await loadStatuses();

    // Only re-render if something changed
    const changed = Object.keys(statuses).some(
      (id) => statuses[id] !== prevStatuses[id]
    );
    if (changed) render();
  }, 10000);
}

window.addEventListener("DOMContentLoaded", init);
