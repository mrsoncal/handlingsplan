// --- Handlingsplan script.js (DB-only version) ---

const API_BASE = "https://handlingsplan-backend.onrender.com";
const SUGG_API = API_BASE + "/api/suggestions";

const isMobile = window.innerWidth <= 600;
const track = document.getElementById("carousel-track");
if (isMobile && track) track.classList.add("stacked");

let currentIndex = 0;
let savedVedtatt = {};
let SEEN_IDS = new Set();

// ---------- Auth / UI wiring ----------

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const loginSection = document.getElementById("login-section");
  const mainContent = document.getElementById("main-content");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");

  if (!loginSection || !mainContent || !loginButton) {
    console.warn("Missing key elements for login UI.");
    return;
  }

  if (!token) {
    loginSection.style.display = "none";
    loginButton.style.display = "inline-block";
    if (logoutButton) logoutButton.style.display = "none";
    document.body.classList.remove("logged-in");
  } else {
    loginSection.style.display = "none";
    loginButton.style.display = "none";
    if (logoutButton) logoutButton.style.display = "inline-block";
    document.body.classList.add("logged-in");
  }

  loginButton.addEventListener("click", () => {
    loginSection.style.display = "flex";
    loginButton.style.display = "none";
  });

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      localStorage.removeItem("token");
      location.reload();
    });
  }
});

// ---------- Helpers ----------

function withSilentUI(fn) {
  document.documentElement.classList.add("silent-update");
  try { fn(); } finally {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("silent-update");
    });
  }
}

// ---------- Vedta click handler ----------

function handleVedtaClick(tr, btn) {
  const isVedtatt = !tr.classList.contains("vedtatt");
  const suggestionId = tr.dataset.suggestionId;
  const token = localStorage.getItem("token");

  withSilentUI(() => {
    tr.classList.toggle("vedtatt", isVedtatt);
    btn.classList.toggle("vedtatt", isVedtatt);
    btn.textContent = isVedtatt ? "Vedtatt" : "Vedta";
  });

  fetch(`${SUGG_API}/${encodeURIComponent(suggestionId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ status: isVedtatt ? "vedtatt" : "ny", actor: "admin" }),
  }).then(async (r) => {
    if (!r.ok) {
      const t = await r.text();
      console.warn("PATCH /api/suggestions failed", r.status, t);
    }
  }).catch((err) => console.warn("PATCH /api/suggestions failed:", err));
}

// ---------- Data loading & rendering ----------

async function loadSuggestions() {
  try {
    const res = await fetch(SUGG_API, { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    renderSuggestions(data.items || []);
  } catch (err) {
    console.error("loadSuggestions failed:", err);
    document.getElementById("carousel-track").innerHTML =
      "<p>Kunne ikke laste inn data fra databasen.</p>";
  }
}

function renderSuggestions(items) {
  const track = document.getElementById("carousel-track");
  track.innerHTML = "";
  SEEN_IDS = new Set();

  if (!items.length) {
    track.innerHTML = "<p>Ingen forslag funnet.</p>";
    return;
  }

  const grouped = {};
  for (const it of items) {
    const tema = it.payload?.["Velg et tema"] || "Uten tema";
    if (!grouped[tema]) grouped[tema] = [];
    grouped[tema].push(it);
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
    ["Velg et punkt (nr)", "Hva vil du gjøre?", "Forslag", "Begrunnelse", "Forslagsstiller"].forEach(h => {
      const th = document.createElement("th");
      th.textContent = h;
      headerRow.appendChild(th);
    });
    const thBtn = document.createElement("th");
    headerRow.appendChild(thBtn);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    for (const it of group) {
      const tr = document.createElement("tr");
      tr.dataset.suggestionId = it.suggestion_id;
      const payload = it.payload || {};

      ["Velg et punkt (nr)", "Hva vil du gjøre?", "Forslag", "Begrunnelse", "Forslagsstiller"].forEach(h => {
        const td = document.createElement("td");
        td.textContent = payload[h] || "";
        tr.appendChild(td);
      });

      const tdAction = document.createElement("td");
      const btn = document.createElement("button");
      btn.textContent = it.status === "vedtatt" ? "Vedtatt" : "Vedta";
      btn.className = "vedta-button";
      if (it.status === "vedtatt") {
        tr.classList.add("vedtatt");
        btn.classList.add("vedtatt");
      }
      btn.onclick = () => handleVedtaClick(tr, btn);
      tdAction.appendChild(btn);
      tr.appendChild(tdAction);

      tbody.appendChild(tr);
      SEEN_IDS.add(it.suggestion_id);
    }

    table.appendChild(tbody);
    slide.appendChild(table);
    track.appendChild(slide);
  }

  updateCarousel();
}

// ---------- Carousel controls ----------

function updateCarousel() {
  const track = document.getElementById("carousel-track");
  const totalSlides = track.children.length;
  currentIndex = (currentIndex + totalSlides) % totalSlides;
  track.style.transform = `translateX(-${currentIndex * 100}%)`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function nextSlide() {
  currentIndex++;
  updateCarousel();
}

function prevSlide() {
  currentIndex--;
  updateCarousel();
}

// ---------- Auto refresh ----------
window.addEventListener("DOMContentLoaded", () => {
  loadSuggestions();
  setInterval(loadSuggestions, 10000);
});
