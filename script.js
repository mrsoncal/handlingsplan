// --- Handlingsplan frontend (merged version: DB source + stable visuals) ---

const rootEl = document.documentElement;
let hasPaintedOnce = false;
rootEl.classList.add('initial-boot');

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

// ---------- RENDER ----------
function render(items) {
  const track = document.getElementById("carousel-track");
  if (!track) {
    console.warn("[render] no #carousel-track found");
    return;
  }

  // Build a simple fingerprint of the data
  const newHash = JSON.stringify(items.map(i => [
    i.suggestion_id,
    i.status,
    i.updated_at
  ]));

  // Skip re-render if nothing has changed
  if (newHash === lastDataHash) {
    console.debug("[render] skipped (no data change)");
    return;
  }

  console.debug("[render] data changed → rebuilding UI");
  lastDataHash = newHash;

  // Disable animations after first render
  if (hasPaintedOnce) rootEl.classList.add("silent-update");

  const frag = document.createDocumentFragment();
  const groups = sortAndGroup(items);
  let slideCount = 0;
  let rowCount = 0;

  for (const [tema, group] of groups) {
    slideCount++;
    const slide = document.createElement("div");
    slide.className = "carousel-slide";

    const h2 = document.createElement("h2");
    h2.textContent = tema;
    slide.appendChild(h2);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    // Use your constant COLS array for column headers
    for (const h of COLS) {
      const th = document.createElement("th");
      th.textContent = h;
      headRow.appendChild(th);
    }

    // Add an empty <th> for the Vedta button column
    headRow.appendChild(document.createElement("th"));
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    for (const s of group) {
      rowCount++;
      const tr = document.createElement("tr");
      tr.dataset.id = s.suggestion_id;

      const status = s.status || "ny";
      const payload = s.payload || {};

      // Fill in normal data columns
      for (const k of COLS) {
        const td = document.createElement("td");
        td.textContent = payload[k] ?? "";
        tr.appendChild(td);
      }

      // Action button column
      const tdBtn = document.createElement("td");
      const btn = document.createElement("button");
      btn.textContent = status === "vedtatt" ? "Vedtatt" : "Vedta";
      btn.className = "vedta-button";
      if (status === "vedtatt") {
        tr.classList.add("vedtatt");
        btn.classList.add("vedtatt");
      }

        btn.onclick = async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            // Derive current status defensively from DOM or data
            const tr = btn.closest("tr");
            const id = s.suggestion_id;
            const domStatus = tr?.classList.contains("vedtatt") || btn.classList.contains("vedtatt") ? "vedtatt" : "ny";
            const currentStatus = (s.status === "vedtatt" || domStatus === "vedtatt") ? "vedtatt" : "ny";
            const newStatus = currentStatus === "vedtatt" ? "ny" : "vedtatt";

            const endpoint = `${API}/${encodeURIComponent(id)}`;
            const token = localStorage.getItem("token");

            console.debug("[Vedta] click",
                { id, currentStatus, newStatus, endpoint });

            // Prevent double-clicks while the request is in flight
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
                body: JSON.stringify({
                    status: newStatus,
                    actor: "admin"
                    // If your API supports optimistic concurrency:
                    // expectedUpdatedAt: s.updated_at
                })
                });

                if (!resp.ok) {
                const txt = await resp.text().catch(() => "(no text)");
                console.error("[Vedta][PATCH] failed", resp.status, txt);
                } else {
                const data = await resp.json().catch(() => null);
                const dt = Math.round(performance.now() - t0);
                const returned = data?.item || data || {};
                console.debug("[Vedta][PATCH] ok",
                    { ms: dt, returnedStatus: returned.status, updated_at: returned.updated_at, id: returned.suggestion_id });

                // Force an immediate fresh GET + re-render
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
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    slide.appendChild(table);
    frag.appendChild(slide);
  }

  // Replace DOM content all at once
  track.replaceChildren(frag);

  // Mark that first render is done
  if (!hasPaintedOnce) hasPaintedOnce = true;

  // Re-enable animations after DOM updates
  requestAnimationFrame(() => {
    rootEl.classList.remove("silent-update");
    rootEl.classList.remove("initial-boot");
    console.debug(`[render] complete: ${slideCount} slides, ${rowCount} rows`);
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
