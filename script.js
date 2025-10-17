// --- Handlingsplan frontend (merged version: DB source + stable visuals) ---

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

  const newHash = JSON.stringify(items.map(i => [i.suggestion_id, i.status, i.updated_at]));
  if (newHash === lastDataHash) return; // nothing new, skip DOM re-render
  lastDataHash = newHash;

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
    const trh = document.createElement("tr");
    for (const h of COLS) {
      const th = document.createElement("th");
      th.textContent = h;
      trh.appendChild(th);
    }
    trh.appendChild(document.createElement("th")); // action col
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    for (const s of group) {
      const tr = document.createElement("tr");
      const status = s.status || "ny";
      const payload = s.payload || {};

      for (const k of COLS) {
        const td = document.createElement("td");
        td.textContent = payload[k] ?? "";
        tr.appendChild(td);
      }

      const tdBtn = document.createElement("td");
      const btn = document.createElement("button");
      btn.textContent = status === "vedtatt" ? "Vedtatt" : "Vedta";
      btn.className = "vedta-button";
      if (status === "vedtatt") {
        tr.classList.add("vedtatt");
        btn.classList.add("vedtatt");
      }

      btn.onclick = async () => {
        const token = localStorage.getItem("token");
        await fetch(`${API}/${encodeURIComponent(s.suggestion_id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            status: status === "vedtatt" ? "ny" : "vedtatt",
            actor: "admin"
          })
        });
        await refresh(true);
      };

      tdBtn.appendChild(btn);
      tr.appendChild(tdBtn);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    slide.appendChild(table);
    frag.appendChild(slide);
  }

  // Atomic DOM swap (no blink)
  track.replaceChildren(frag);
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
