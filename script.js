// --- Handlingsplan DB-only script.js ---
const API = "https://handlingsplan-backend.onrender.com/api/suggestions";
const COLS = [
  "Hva vil du gjøre?",
  "Velg et tema",
  "Velg et punkt (nr)",
  "Formuler punktet",
  "Endre fra",
  "Endre til"
];
const track = document.getElementById("carousel-track");
let currentIndex = 0;

// ---------- Authentication UI ----------
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const loginSection = document.getElementById("login-section");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");

  if (!token) {
    loginSection.style.display = "none";
    loginButton.style.display = "inline-block";
    logoutButton.style.display = "none";
    document.body.classList.remove("logged-in");
  } else {
    loginSection.style.display = "none";
    loginButton.style.display = "none";
    logoutButton.style.display = "inline-block";
    document.body.classList.add("logged-in");
  }

  loginButton.addEventListener("click", () => {
    loginSection.style.display = "flex";
    loginButton.style.display = "none";
  });
  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("token");
    location.reload();
  });
});

// ---------- Fetch & Render ----------
async function fetchAll() {
  const res = await fetch(API, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).items || [];
}

function render(items) {
  const frag = document.createDocumentFragment();
  if (!items.length) {
    const p = document.createElement("p");
    p.textContent = "Ingen forslag funnet.";
    frag.appendChild(p);
    track.replaceChildren(frag);
    return;
  }

  // Group by tema
  const grouped = {};
  for (const it of items) {
    const tema = it.payload?.["Velg et tema"] || "Uten tema";
    (grouped[tema] ||= []).push(it);
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
    headerRow.appendChild(document.createElement("th"));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    // Sort: numeric then action type
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
      const status = s.status || "ny";
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
      btn.onclick = async () => {
        const token = localStorage.getItem("token");
        await fetch(`${API}/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            status: status === "vedtatt" ? "ny" : "vedtatt",
            actor: "admin",
          }),
        });
        await refresh(); // instant reload
      };

      tdAction.appendChild(btn);
      tr.appendChild(tdAction);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    slide.appendChild(table);
    frag.appendChild(slide);
  }

  track.replaceChildren(frag);
  updateCarousel();
}

// ---------- Carousel Controls ----------
function updateCarousel() {
  const totalSlides = track.children.length;
  currentIndex = (currentIndex + totalSlides) % totalSlides;
  track.style.transform = `translateX(-${currentIndex * 100}%)`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function nextSlide() { currentIndex++; updateCarousel(); }
function prevSlide() { currentIndex--; updateCarousel(); }

// ---------- Periodic Refresh ----------
async function refresh() {
  try {
    const items = await fetchAll();
    render(items);
  } catch (err) {
    console.error("refresh() failed:", err);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  await refresh();
  setInterval(refresh, 10000); // every 10s
});

// ---------- Close login overlay ----------
const loginOverlayEl = document.getElementById("login-section");
if (loginOverlayEl) {
  loginOverlayEl.addEventListener("click", (event) => {
    const loginBox = document.querySelector(".login-box");
    if (loginBox && !loginBox.contains(event.target)) {
      loginOverlayEl.style.display = "none";
      const loginBtn = document.getElementById("login-button");
      if (loginBtn) loginBtn.style.display = "inline-block";
    }
  });
}
