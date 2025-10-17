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

// leave updates silent for just a bit longer
setTimeout(() => {
  rootEl.classList.remove("is-refreshing");
}, 100); // 1 frame is usually enough, 100ms is safe

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
  const url = `${API}?_=${Date.now()}`;
  const controller = new AbortController();

  // 12s safety timeout
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  // up to 3 tries (Render cold start, transient network)
  const tries = [0, 600, 1500]; // ms backoff
  let lastErr;

  for (let i = 0; i < tries.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, tries[i]));
    console.debug(`[fetchAll] GET (try ${i+1}/${tries.length})`, url);

    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "(no body)");
        console.error("[fetchAll] HTTP", res.status, text);
        // Non-2xx reached server; no need to retry unless you want to.
        clearTimeout(timeoutId);
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      const items = Array.isArray(json.items) ? json.items : [];
      const latestUpdated = items.reduce((m, it) => Math.max(m, it?.updated_at ? Date.parse(it.updated_at) : 0), 0);

      console.debug(
        "[fetchAll] OK",
        { count: items.length, serverTime: json.serverTime ?? "(n/a)", latest: latestUpdated ? new Date(latestUpdated).toISOString() : "(none)" }
      );

      clearTimeout(timeoutId);
      return items;
    } catch (err) {
      lastErr = err;
      // AbortError or “TypeError: Failed to fetch” often = CORS/mixed content/network
      console.warn(`[fetchAll] attempt ${i+1} failed:`, err?.name, err?.message);
    }
  }

  clearTimeout(timeoutId);

  // Helpful environment dump
  console.error("[fetchAll] FINAL FAIL", {
    online: navigator.onLine,
    api: API,
    pageOrigin: location.origin,
    userAgent: navigator.userAgent
  });

  // Extra hint for classic causes
  if (location.protocol === "https:" && API.startsWith("http://")) {
    console.error("Mixed content: https page cannot call http API. Use https API.");
  }

  throw lastErr || new Error("fetchAll failed");
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

  // Skip no-op re-renders (data + auth fingerprint)
  const newHash = JSON.stringify([
    isAdmin ? 1 : 0,
    items.map(i => [i.suggestion_id, i.status, i.updated_at])
  ]);
  if (newHash === lastDataHash) {
    console.debug("[render] skipped (no data/login change)");
    return;
  }
  lastDataHash = newHash;

  // Keep general transitions muted on background refreshes after first paint
  if (hasPaintedOnce) rootEl.classList.add("silent-update");

  // ---- anti-flicker guards ----
  rootEl.classList.add("is-refreshing");      // scope-only mute during rebuild
  const prevTrackTransition = track.style.transition; // pause carousel tweening
  track.style.transition = "none";

  const frag = document.createDocumentFragment();
  const groups = sortAndGroup(items);
  let slideCount = 0;
  let rowCount = 0;

  for (const [tema, group] of groups) {
    slideCount++;

    const slide = document.createElement("section");
    slide.className = "slide";

    const h = document.createElement("header");
    h.className = "slide-header";

    const title = document.createElement("h2");
    title.className = "tema-title";
    title.textContent = tema;
    title.style.setProperty("--tema-accent", TEMA_ACCENTS.get(tema) || "#1D3C5B");

    h.appendChild(title);
    slide.appendChild(h);

    const wrapper = document.createElement("div");
    wrapper.className = "table-wrap";

    const table = document.createElement("table");

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const colHeader of COLS) {
      const th = document.createElement("th");
      th.textContent = colHeader;
      headRow.appendChild(th);
    }
    if (isAdmin) {
      const thAction = document.createElement("th");
      thAction.className = "button-header";
      headRow.appendChild(thAction);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    for (const s of group) {
      rowCount++;
      const tr = document.createElement("tr");
      tr.dataset.id = s.suggestion_id;

      const status = s.status || "ny";
      if (status === "vedtatt") tr.classList.add("vedtatt");

      // Data columns (align with your COL_MAP)
      for (const col of COL_MAP) {
        const td = document.createElement("td");
        let val = (s[col.key] ?? "");
        if (col.key === "oppdatert" || col.key === "updated_at") {
          val = formatDate(s.updated_at || s.created_at);
          td.classList.add("cell-time");
        }
        if (col.key === "tema") td.classList.add("cell-tema");
        td.textContent = String(val);
        tr.appendChild(td);
      }

      if (isAdmin) {
        const tdBtn = document.createElement("td");
        tdBtn.className = "cell-action";
        const btn = document.createElement("button");
        btn.textContent = status === "vedtatt" ? "Vedtatt" : "Vedta";
        btn.className = "vedta-button";
        if (status === "vedtatt") btn.classList.add("vedtatt");

        btn.onclick = async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();

          const id = s.suggestion_id;
          const domIsVedtatt = tr.classList.contains("vedtatt") || btn.classList.contains("vedtatt");
          const currentStatus = (s.status === "vedtatt" || domIsVedtatt) ? "vedtatt" : "ny";
          const newStatus = currentStatus === "vedtatt" ? "ny" : "vedtatt";

          const endpoint = `${API}/${encodeURIComponent(id)}`;
          const token = localStorage.getItem("token");

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
              console.debug("[Vedta][PATCH] ok", {
                ms: Math.round(performance.now() - t0),
                returnedStatus: data?.item?.status ?? data?.status,
                updated_at: data?.item?.updated_at ?? data?.updated_at,
                id: data?.item?.suggestion_id ?? data?.suggestion_id
              });
              await refresh(true);
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

    // Filler row to preserve spacing
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

  if (!hasPaintedOnce) hasPaintedOnce = true;

  // ---- restore transitions safely (back inside render) ----
  void track.offsetHeight;                  // ensure no tween on new transform
  track.style.transition = prevTrackTransition || ""; // restore

  // First-load anims only; keep silent updates for background refreshes
  rootEl.classList.remove("initial-boot");

  // Let paints settle, then drop scoped mute
  setTimeout(() => {
    rootEl.classList.remove("is-refreshing");
  }, 100);

  console.debug(`[render] complete: ${slideCount} slides, ${rowCount} rows (admin: ${isAdmin})`);
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

window.addEventListener("online",  () => console.debug("[net] online — refreshing")); 
window.addEventListener("offline", () => console.debug("[net] offline")); 

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
