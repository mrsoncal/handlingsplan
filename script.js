// --- Handlingsplan frontend (merged version: DB source + stable visuals) ---

const rootEl = document.documentElement;
let hasPaintedOnce = false;
rootEl.classList.add('initial-boot');

// Tema → accent color
const TEMA_ACCENTS = new Map([
  ["Ungdomsdemokrati og Medvirkning", "#DD1367"],
  ["Samferdsel",                     "#FF6A18"],
  ["Utdanning og Kompetanse",        "#C5182C"],
  ["Folkehelse",                     "#52A23E"],
  ["Klima og Miljø",                 "#1C7A23"],
  ["Kultur",                         "#DD1367"], // per your list
]);

function applySlideAccent(slideEl, tema) {
  const color = TEMA_ACCENTS.get(tema) || "#888";
  slideEl.style.setProperty("--accent", color);
  slideEl.dataset.tema = tema; // nice to have (for debugging/styling)
}


const API = "https://handlingsplan-backend.onrender.com/api/suggestions";
const COLS = [
  "Hva vil du gjøre?",
  "Velg et punkt (nr)",
  "Formuler punktet",
  "Endre fra",
  "Endre til"
];
let lastDataHash = ""; // to detect if data actually changed before re-render

let currentSlide = 0;

function actionClassFrom(label = "") {
  // Map exact values to the CSS classes you already styled
  if (label === "Legge til et punkt") return "Legge-til-et-punkt";
  if (label === "Endre et punkt")     return "Endre-et-punkt";
  if (label === "Fjerne et punkt")    return "Fjerne-et-punkt";
  return "";
}

function makeTagLabel(text) {
  const span = document.createElement("span");
  span.className = "tag-label";
  span.textContent = text || "";
  return span;
}

// Keep the track positioned to the current slide
function updateCarousel() {
  const track = document.getElementById("carousel-track");
  if (!track) return;
  const total = track.children.length;
  if (!total) return;

  // clamp index
  if (currentSlide < 0) currentSlide = 0;
  if (currentSlide > total - 1) currentSlide = total - 1;

  // Move the track (each slide is 100% width)
  track.style.transform = `translateX(-${currentSlide * 100}%)`;
  console.debug(`[carousel] slide ${currentSlide + 1}/${total}`);
}

// Public controls for the HTML buttons
function nextSlide() {
  currentSlide += 1;
  updateCarousel();
}
function prevSlide() {
  currentSlide -= 1;
  updateCarousel();
}

// Expose to inline onclick handlers in index.html
window.nextSlide = nextSlide;
window.prevSlide  = prevSlide;

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
  // Build a cache-busting URL so every poll is truly fresh.
  const url = `${API}?_=${Date.now()}`;
  console.debug("[fetchAll] GET", url);

  const t0 = performance.now();
  let res;
  try {
    res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (netErr) {
    console.error("[fetchAll] network error:", netErr);
    throw netErr;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    console.error("[fetchAll] HTTP", res.status, body);
    throw new Error(`fetchAll failed: ${res.status}`);
  }

  let json;
  try {
    json = await res.json();
  } catch (parseErr) {
    console.error("[fetchAll] JSON parse error:", parseErr);
    throw parseErr;
  }

  const items = Array.isArray(json.items) ? json.items : [];
  const t1 = performance.now();

  const latestUpdated = items.reduce((max, it) => {
    const ts = it?.updated_at ? Date.parse(it.updated_at) : 0;
    return Math.max(max, ts);
  }, 0);

  console.debug(
    "[fetchAll] received",
    items.length,
    "items | serverTime:",
    json.serverTime ?? "(n/a)",
    "| latest.updated_at:",
    latestUpdated ? new Date(latestUpdated).toISOString() : "(none)",
    `| ${Math.round(t1 - t0)} ms`
  );

  return items;
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

// ---------- RENDER (login-aware) ----------
function render(items) {
  const track = document.getElementById("carousel-track");
  if (!track) {
    console.warn("[render] no #carousel-track found");
    return;
  }

  const isAdmin = document.body.classList.contains("logged-in");

  // Fingerprint of the data + login state to skip no-op rerenders
  const newHash = JSON.stringify([
    isAdmin ? 1 : 0,
    items.map(i => [i.suggestion_id, i.status, i.updated_at])
  ]);

  if (newHash === lastDataHash) {
    console.debug("[render] skipped (no data/login change)");
    return;
  }

  console.debug("[render] data/login changed → rebuilding UI (admin:", isAdmin, ")");
  lastDataHash = newHash;

  // Disable animations after first render
  if (hasPaintedOnce) rootEl.classList.add("silent-update");

  const frag = document.createDocumentFragment();
  const groups = sortAndGroup(items);
  let slideCount = 0;
  let rowCount = 0;

  for (const [tema, group] of groups) {
    slideCount++;

    // Slide container
    const slide = document.createElement("div");
    slide.className = "carousel-slide";

    // Slide title
    const h2 = document.createElement("h2");
    h2.textContent = tema;
    slide.appendChild(h2);

    // Set accent color based on tema
    if (typeof applySlideAccent === "function") applySlideAccent(slide, tema);

    // Table wrapper (rounded corners styling)
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrapper";

    // Table + header
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    // Data column headers
    for (const colHeader of COLS) {
      const th = document.createElement("th");
      th.textContent = colHeader;
      headRow.appendChild(th);
    }

    // Action column header ONLY when logged in
    if (isAdmin) {
      const thAction = document.createElement("th");
      thAction.className = "button-header";
      // thAction.textContent = "Vedtá"; // optional label
      headRow.appendChild(thAction);
    }

    thead.appendChild(headRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");

    for (const s of group) {
      rowCount++;
      const tr = document.createElement("tr");
      tr.dataset.id = s.suggestion_id;

      const status = s.status || "ny";
      const payload = s.payload || {};

      // Row action class for colored tag styles
      const actionLabel = payload["Hva vil du gjøre?"] || "";
      if (typeof actionClassFrom === "function") {
        const actionCls = actionClassFrom(actionLabel);
        if (actionCls) tr.classList.add(actionCls);
      }
      if (status === "vedtatt") tr.classList.add("vedtatt");

      // Data columns — first column uses a colored tag pill
      for (let i = 0; i < COLS.length; i++) {
        const key = COLS[i];
        const td = document.createElement("td");
        if (i === 0 && typeof makeTagLabel === "function") {
          td.appendChild(makeTagLabel(payload[key] ?? ""));
        } else {
          td.textContent = payload[key] ?? "";
        }
        tr.appendChild(td);
      }

      // Action button column ONLY when logged in
      if (isAdmin) {
        const tdBtn = document.createElement("td");
        tdBtn.className = "button-cell";

        const btn = document.createElement("button");
        btn.textContent = status === "vedtatt" ? "Vedtatt" : "Vedta";
        btn.className = "vedta-button";
        if (status === "vedtatt") btn.classList.add("vedtatt");

        // Robust toggle handler (reuses your existing logic)
        btn.onclick = async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();

          const trEl = btn.closest("tr");
          const id = s.suggestion_id;
          const domStatus = trEl?.classList.contains("vedtatt") || btn.classList.contains("vedtatt") ? "vedtatt" : "ny";
          const currentStatus = (s.status === "vedtatt" || domStatus === "vedtatt") ? "vedtatt" : "ny";
          const newStatus = currentStatus === "vedtatt" ? "ny" : "vedtatt";

          const endpoint = `${API}/${encodeURIComponent(id)}`;
          const token = localStorage.getItem("token");

          console.debug("[Vedta] click", { id, currentStatus, newStatus, endpoint });

          btn.disabled = true;
          btn.setAttribute("aria-busy", "true");

          const t0 = performance.now();
          try {
            const resp = await fetch(endpoint, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              },
              body: JSON.stringify({ status: newStatus, actor: "admin" })
            });

            if (!resp.ok) {
              const txt = await resp.text().catch(() => "(no text)");
              console.error("[Vedta][PATCH] failed", resp.status, txt);
            } else {
              const data = await resp.json().catch(() => null);
              const dt = Math.round(performance.now() - t0);
              const returned = data?.item || data || {};
              console.debug("[Vedta][PATCH] ok", {
                ms: dt,
                returnedStatus: returned.status,
                updated_at: returned.updated_at,
                id: returned.suggestion_id
              });
              await refresh(true); // fetch fresh + redraw
            }
          } catch (err) {
            console.error("[Vedta][PATCH] network error", err);
          } finally {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
          }
        };

        tdBtn.appendChild(btn);
        tr.appendChild(tdBtn);
      }

      tbody.appendChild(tr);
    }

    // Footer filler row (colSpan matches columns actually rendered)
    const filler = document.createElement("tr");
    filler.className = "filler-row";
    const fillerTd = document.createElement("td");
    fillerTd.colSpan = COLS.length + (isAdmin ? 1 : 0);
    filler.appendChild(fillerTd);
    tbody.appendChild(filler);

    table.appendChild(tbody);
    wrapper.appendChild(table);
    slide.appendChild(wrapper);
    frag.appendChild(slide);
  }

  // Atomic DOM swap
  track.replaceChildren(frag);

  // Keep current slide position valid after DOM changes
  if (typeof updateCarousel === "function") updateCarousel();

  // First render marker
  if (!hasPaintedOnce) hasPaintedOnce = true;

  // Re-enable animations on next frame
  requestAnimationFrame(() => {
    rootEl.classList.remove("silent-update");
    rootEl.classList.remove("initial-boot");
    console.debug(`[render] complete: ${slideCount} slides, ${rowCount} rows (admin: ${isAdmin})`);
  });
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

// ---------- INITIALIZATION & REFRESH INTERVAL ----------
window.addEventListener("DOMContentLoaded", async () => {
  console.debug("[init] DOMContentLoaded – starting initial refresh");
  try {
    await refresh(true);
  } catch (err) {
    console.error("[init] initial refresh failed:", err);
  }

  // Poll for new data every 10 seconds
  setInterval(() => {
    console.debug("[poll] running scheduled refresh");
    refresh();
  }, 10000);
});

// Refresh when the user focuses or returns to the tab
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    console.debug("[refresh] visibilitychange → refreshing now");
    refresh(true);
  }
});
window.addEventListener("focus", () => {
  console.debug("[refresh] window focus → refreshing now");
  refresh(true);
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
