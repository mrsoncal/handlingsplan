// --- Handlingsplan script.js (ID in last column H) ---

// CSV published from your Google Sheet
const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTf-bAq0V8H8vLpSSEzpf18GPcW7ZROEK-MMNvy99Mbz3Be8EQ63By7hGofAg5R2Od7KUYtr95w23JO/pub?output=csv";

const isMobile = window.innerWidth <= 600;
const track = document.getElementById("carousel-track");
if (isMobile && track) track.classList.add("stacked");

let currentIndex = 0;

let savedVedtatt = {};
const SEEN_IDS = new Set();
let HEADERS = [];
let ID_COL_NAME = "Forslags-ID"; // or whatever your ID column is called in the sheet

const API_BASE = "https://handlingsplan-backend.onrender.com";
const SUGG_API = API_BASE + "/api/suggestions";


// ---------- Helpers ----------

// Simple deterministic hash (fallback when a row lacks an ID)
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

// Build a fallback key from key fields so rows without ID still get something stable-ish.
function fallbackSuggestionKey(row) {
  const tema = (row["Velg et tema"] || "").trim();
  const punkt = (row["Velg et punkt (nr)"] || "").trim();
  const action = (row["Hva vil du gjøre?"] || "").trim();

  const more = [
    row["Forslag"] || "",
    row["Begrunnelse"] || "",
    row["Forslagsstiller"] || ""
  ].join("|");

  return hashString([tema, punkt, action, more].join("||"));
}

// ---------- Auth / UI wiring ----------

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");

  const loginSection = document.getElementById("login-section");
  const mainContent = document.getElementById("main-content");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");

  if (!loginSection || !mainContent || !loginButton) {
    console.warn("One or more required elements are missing.");
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

function withSilentUI(fn) {
  document.documentElement.classList.add("silent-update");
  try { fn(); } finally {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("silent-update");
    });
  }
}

// ---------- Vedta click handler (uses suggestionId + Authorization header) ----------

function handleVedtaClick(tr, btn) {
  // Determine the new state (toggle)
  const isVedtatt = !tr.classList.contains("vedtatt");
  const suggestionId = tr.dataset.suggestionId;
  const token = localStorage.getItem("token");

    // Apply UI changes without animations
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

// ---------- Data load & render ----------

async function loadCSV() {
  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      document.getElementById("carousel-track").innerHTML = "<p>Kunne ikke laste inn data.</p>";
      return;
    }

    const text = await response.text();

    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: async function (results) {
        let data = results.data;

        // Clean unexpected keys like "_1"
        data = data.map((row) => {
          const cleaned = {};
          for (const key of Object.keys(row)) {
            if (key && !key.startsWith("_")) {
              cleaned[key] = row[key];
            }
          }
          return cleaned;
        });

        if (!data.length) {
          document.getElementById("carousel-track").innerHTML = "<p>Ingen data funnet.</p>";
          return;
        }

        const headers = Object.keys(data[0]);

        // Decide which ID column exists in the sheet
        const idIndex = headers.indexOf("ID");
        HEADERS = headers;
        ID_COL_NAME = idIndex !== -1 ? "ID" : "Forslags-ID";  // set the GLOBAL, no shadowing

        if (idIndex === -1) {
          console.warn("Fant ikke 'ID'-kolonnen i CSV. Bruker fallback-hash for forslag.");
        }

        // Load saved vedtatt states (graceful on error)
        try {
            // --- New API base ---
            
            const res = await fetch(SUGG_API + "?status=vedtatt", { cache: "no-store" });
            if (res.ok) {
                const data = await res.json(); // { items, serverTime }
                const arr = Array.isArray(data.items) ? data.items : [];
                savedVedtatt = Object.fromEntries(arr.map(it => [it.suggestion_id, true]));
            } else {
                console.warn("GET /api/suggestions?status=vedtatt failed with", res.status);
            }

        } catch (err) {
        console.warn("GET /vedtatt failed:", err);
        }

        // Group by tema
        const grouped = {};
        data.forEach((row) => {
          const tema = row["Velg et tema"]?.trim();
          if (!tema) return;
          if (!grouped[tema]) grouped[tema] = [];
          grouped[tema].push(row);
        });

        // Sort within each tema: punkt (nr) asc, then action type
        Object.keys(grouped).forEach((tema) => {
          grouped[tema] = grouped[tema].sort((a, b) => {
            const numA = parseInt(a["Velg et punkt (nr)"]) || 0;
            const numB = parseInt(b["Velg et punkt (nr)"]) || 0;
            if (numA !== numB) return numA - numB;

            const order = { "Legge til et punkt": 0, "Endre et punkt": 1, "Fjerne et punkt": 2 };
            const aO = order[a["Hva vil du gjøre?"]] ?? 99;
            const bO = order[b["Hva vil du gjøre?"]] ?? 99;
            return aO - bO;
          });
        });

        const temaOrder = [
          "Ungdomsdemokrati og Medvirkning",
          "Samferdsel",
          "Utdanning og Kompetanse",
          "Folkehelse",
          "Klima og Miljø",
          "Kultur",
        ];

        const track = document.getElementById("carousel-track");

        temaOrder.forEach((tema) => {
          const groupRows = grouped[tema];
          if (!groupRows || groupRows.length === 0) return;

          const slide = document.createElement("div");
          slide.className = "carousel-slide";

          const h2 = document.createElement("h2");
          h2.textContent = tema;
          slide.appendChild(h2);

          const table = document.createElement("table");
          const thead = document.createElement("thead");
          const headerRow = document.createElement("tr");

          // Render all headers except 'Velg et tema' and 'ID'
          headers.forEach((h) => {
            if (h === "Velg et tema" || h === ID_COL_NAME) return;
            const th = document.createElement("th");
            th.textContent = h === "Velg et punkt (nr)" ? "punkt" : h;
            headerRow.appendChild(th);
          });

          const thBtn = document.createElement("th");
          thBtn.className = "button-header";
          headerRow.appendChild(thBtn);
          thead.appendChild(headerRow);
          table.appendChild(thead);

          const tbody = document.createElement("tbody");

          groupRows.forEach((row) => {
            const tr = document.createElement("tr");

            // Prefer sheet-provided ID; otherwise fallback hash based on content
            const idFromSheet = ((row[ID_COL_NAME] ?? "") + "").trim();
            const suggestionId = idFromSheet || fallbackSuggestionKey(row);
            tr.dataset.suggestionId = suggestionId;
            SEEN_IDS.add(suggestionId);

            // Add CSS class based on action
            tr.className = row["Hva vil du gjøre?"]?.trim().replace(/\s/g, "-");

            // Render cells (skip 'Velg et tema' and 'ID')
            headers.forEach((header) => {
              if (header === "Velg et tema" || header === ID_COL_NAME) return;

              const td = document.createElement("td");
              if (header === "Velg et punkt (nr)") td.style.textAlign = "center";

              const cell = row[header];
              if (header === "Hva vil du gjøre?") {
                const tagDiv = document.createElement("div");
                tagDiv.className = "tag-label";
                tagDiv.textContent = cell;
                td.appendChild(tagDiv);
              } else {
                td.textContent = cell;
              }

              tr.appendChild(td);
            });

            // Action cell (Vedta)
            const tdAction = document.createElement("td");
            tdAction.className = "button-cell";

            const btn = document.createElement("button");
            btn.textContent = "Vedta";
            btn.className = "vedta-button";
            btn.onclick = () => handleVedtaClick(tr, btn);

            tdAction.appendChild(btn);
            tr.appendChild(tdAction);

            // Apply saved vedtatt state
            if (suggestionId && savedVedtatt[suggestionId]) {
              tr.classList.add("vedtatt");
              btn.classList.add("vedtatt");
              btn.textContent = "Vedtatt";

              if (!localStorage.getItem("token")) {
                const label = document.createElement("span");
                label.className = "vedtatt-label";
                label.textContent = "✔ Vedtatt!";
                tdAction.appendChild(label);
              }
            }

            tbody.appendChild(tr);
          });

          table.appendChild(tbody);

          const wrapper = document.createElement("div");
          wrapper.className = "table-wrapper";
          wrapper.appendChild(table);
          slide.appendChild(wrapper);
          track.appendChild(slide);

          // Add a small filler row so rounded corners look nice with CSS
          let headerBg = "#f0f0f0";
          const th = slide.querySelector("th:not(.button-header)");
          if (th) {
            const computed = window.getComputedStyle(th);
            headerBg = computed.backgroundColor;
          }

          const fillerRow = document.createElement("tr");
          fillerRow.className = "filler-row";

          // columns rendered = total headers minus the two skipped ('Velg et tema' + 'ID')
          const renderedColumns =
            headers.length -
            (headers.includes("Velg et tema") ? 1 : 0) -
            (headers.includes(ID_COL_NAME) ? 1 : 0);

          for (let i = 0; i < renderedColumns; i++) {
            const td = document.createElement("td");
            td.innerHTML = "&nbsp;";
            td.style.height = "1.25rem";
            fillerRow.appendChild(td);             
        }

          tbody.appendChild(fillerRow);
        });

        updateCarousel();
        startCsvPolling();
      },
    });
  } catch (error) {
    console.error("[ERROR] Exception in loadCSV:", error);
  }
}

function insertSingleRow(row, headers = HEADERS, idCol = ID_COL_NAME) {
  const tema = row["Velg et tema"]?.trim();
  if (!tema) return;

  // Find the correct slide by <h2>
  const slides = document.querySelectorAll(".carousel-slide");
  let slide = null;
  for (const s of slides) {
    const h2 = s.querySelector("h2");
    if (h2 && h2.textContent.trim() === tema) { slide = s; break; }
  }
  if (!slide) return;

  const table = slide.querySelector("table");
  const tbody = table?.querySelector("tbody");
  if (!tbody) return;

  // Build the <tr> identical to initial render
  const tr = document.createElement("tr");

  const idFromSheet = ((row[ID_COL_NAME] ?? "") + "").trim();
  const suggestionId = idFromSheet || fallbackSuggestionKey(row);
  tr.dataset.suggestionId = suggestionId;

  tr.className = row["Hva vil du gjøre?"]?.trim().replace(/\s/g, "-");

  headers.forEach((header) => {
    if (header === "Velg et tema" || header === idCol) return;
    const td = document.createElement("td");
    if (header === "Velg et punkt (nr)") td.style.textAlign = "center";
    const cell = row[header];
    if (header === "Hva vil du gjøre?") {
      const tagDiv = document.createElement("div");
      tagDiv.className = "tag-label";
      tagDiv.textContent = cell;
      td.appendChild(tagDiv);
    } else {
      td.textContent = cell;
    }
    tr.appendChild(td);
  });

  const tdAction = document.createElement("td");
  tdAction.className = "button-cell";
  const btn = document.createElement("button");
  btn.textContent = "Vedta";
  btn.className = "vedta-button";
  btn.onclick = () => handleVedtaClick(tr, btn);
  tdAction.appendChild(btn);
  tr.appendChild(tdAction);

  if (suggestionId && savedVedtatt[suggestionId]) {
    tr.classList.add("vedtatt");
    btn.classList.add("vedtatt");
    btn.textContent = "Vedtatt";
    if (!localStorage.getItem("token")) {
      const label = document.createElement("span");
      label.className = "vedtatt-label";
      label.textContent = "✔ Vedtatt!";
      tdAction.appendChild(label);
    }
  }

  // Insert before the filler row so the rounded corner stays last
  const filler = tbody.querySelector(".filler-row");
  tbody.insertBefore(tr, filler || null);

  SEEN_IDS.add(suggestionId);
}

let csvPollTimer = null;

function startCsvPolling() {
  async function checkForNew() {
    try {
      // cache-bust to avoid stale CSV
      const res = await fetch(csvUrl + (csvUrl.includes("?") ? "&" : "?") + "ts=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const text = await res.text();

      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = (results.data || []).map((row) => {
            const cleaned = {};
            for (const key of Object.keys(row)) {
              if (key && !key.startsWith("_")) cleaned[key] = row[key];
            }
            return cleaned;
          });

          // Scan for rows we haven't seen yet
          const newcomers = [];
          for (const row of rows) {
            const idFromSheet = ((row[ID_COL_NAME] ?? "") + "").trim();
            const suggestionId = idFromSheet || fallbackSuggestionKey(row);
            if (!suggestionId) continue;
            if (!SEEN_IDS.has(suggestionId)) {
              newcomers.push(row);
            }
          }

          if (newcomers.length) {
            // Insert silently (no animations)
            document.documentElement.classList.add("silent-update");
            try {
              newcomers.forEach((row) => insertSingleRow(row, HEADERS, ID_COL_NAME));
            } finally {
              requestAnimationFrame(() => {
                document.documentElement.classList.remove("silent-update");
              });
            }
          }
        },
      });
    } catch (e) {
      console.warn("CSV poll failed:", e);
    }
  }

  // poll every 10s (tweak as you like)
  clearInterval(csvPollTimer);
  csvPollTimer = setInterval(checkForNew, 10000);
}


// Close login overlay when clicking outside the box
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

window.addEventListener("DOMContentLoaded", loadCSV);function render() {
  if (!track) return;
  withSilentUI(() => {
    const frag = document.createDocumentFragment();

    if (!suggestions.length) {
      const p = document.createElement("p");
      p.textContent = "Ingen forslag funnet.";
      frag.appendChild(p);
      track.replaceChildren(frag);
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
      headerRow.appendChild(document.createElement("th"));
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

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
      frag.appendChild(slide);
    }

    track.replaceChildren(frag);
    updateCarousel();
  });
}
