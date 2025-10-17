// --- Handlingsplan frontend (merged version: DB source + stable visuals) ---

const rootEl = document.documentElement;
let hasPaintedOnce = false;

const API = "https://handlingsplan-backend.onrender.com/api/suggestions";
const COLS = [
  "Hva vil du gjøre?",
  "Velg et tema",
  "Velg et punkt (nr)",
  "Formuler punktet",
  "Endre fra",
  "Endre til"
];
let lastDataHash = ""; // to detect if data actually changed before re-render

// ---------- AUTH HANDLING ----------
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

// ---------- FETCH FROM BACKEND ----------
async function fetchAll() {
  const res = await fetch(API, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.items || [];
}

// ---------- SORT & GROUP ----------
function sortAndGroup(items) {
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
    "Kultur"
  ];

  const order = { "Legge til et punkt": 0, "Endre et punkt": 1, "Fjerne et punkt": 2 };

  for (const tema in grouped) {
    grouped[tema].sort((a, b) => {
      const pa = a.payload || {}, pb = b.payload || {};
      const nA = parseInt(pa["Velg et punkt (nr)"]) || 0;
      const nB = parseInt(pb["Velg et punkt (nr)"]) || 0;
      if (nA !== nB) return nA - nB;
      const oA = order[pa["Hva vil du gjøre?"]] ?? 99;
      const oB = order[pb["Hva vil du gjøre?"]] ?? 99;
      return oA - oB;
    });
  }

  // Return items grouped in display order
  const sortedGroups = [];
  for (const tema of temaOrder) {
    if (grouped[tema]) sortedGroups.push([tema, grouped[tema]]);
  }
  return sortedGroups;
}

// ---------- RENDER ----------

function render(items) {
  const track = document.getElementById("carousel-track");
  if (!track) return;

  // Skip re-render if nothing has changed (for performance)
  const newHash = JSON.stringify(items.map(i => [i.suggestion_id, i.status, i.updated_at]));
  if (newHash === lastDataHash) return;
  lastDataHash = newHash;

  // 👇 Disable animations after first render
  if (hasPaintedOnce) rootEl.classList.add("silent-update");

  const frag = document.createDocumentFragment();
  const groups = sortAndGroup(items);

  for (const [tema, group] of groups) {
    const slide = document.createElement("div");
    slide.className = "carousel-slide";

    const h2 = document.createElement("h2");
    h2.textContent = tema;
    slide.appendChild(h2);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    const headers = [
      "Tittel",
      "Beskrivelse",
      "Tiltakshaver",
      "Sist oppdatert",
      "Status",
      "Vedtatt"
    ];

    headers.forEach(header => {
      const th = document.createElement("th");
      th.textContent = header;
      headRow.appendChild(th);
    });

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    group.forEach(item => {
      const tr = document.createElement("tr");
      tr.dataset.id = item.suggestion_id;

      const tittel = item.payload?.Tittel || "";
      const beskrivelse = item.payload?.Beskrivelse || "";
      const tiltakshaver = item.payload?.Tiltakshaver || "";
      const updated = item.updated_at
        ? new Date(item.updated_at).toLocaleDateString("no-NO", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "";
      const status = item.status || "ny";

      const td1 = document.createElement("td");
      td1.textContent = tittel;

      const td2 = document.createElement("td");
      td2.textContent = beskrivelse;

      const td3 = document.createElement("td");
      td3.textContent = tiltakshaver;

      const td4 = document.createElement("td");
      td4.textContent = updated;

      const td5 = document.createElement("td");
      td5.textContent = status;

      const td6 = document.createElement("td");
      const btn = document.createElement("button");
      btn.textContent = status === "vedtatt" ? "✓" : "Vedtá";
      btn.className = status === "vedtatt" ? "approved" : "";
      btn.addEventListener("click", () => toggleVedta(item));
      td6.appendChild(btn);

      [td1, td2, td3, td4, td5, td6].forEach(td => tr.appendChild(td));
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    slide.appendChild(table);
    frag.appendChild(slide);
  }

  // Replace DOM content all at once
  track.replaceChildren(frag);

  // ✅ Mark that first render is done
  if (!hasPaintedOnce) hasPaintedOnce = true;

  // ✅ Re-enable animations after the DOM updates
  requestAnimationFrame(() => rootEl.classList.remove("silent-update"));
}

// ---------- REFRESH ----------
async function refresh(force = false) {
  try {
    const items = await fetchAll();
    if (force) lastDataHash = ""; // force redraw when explicit
    render(items);
  } catch (err) {
    console.error("refresh failed:", err);
  }
}

// ---------- AUTO REFRESH ----------
window.addEventListener("DOMContentLoaded", async () => {
  await refresh(true);
  setInterval(refresh, 10000); // every 10s
});

// ---------- CLOSE LOGIN OVERLAY ----------
const loginOverlayEl = document.getElementById("login-section");
if (loginOverlayEl) {
  loginOverlayEl.addEventListener("click", (event) => {
    const box = document.querySelector(".login-box");
    if (box && !box.contains(event.target)) {
      loginOverlayEl.style.display = "none";
      const loginBtn = document.getElementById("login-button");
      if (loginBtn) loginBtn.style.display = "inline-block";
    }
  });
}
