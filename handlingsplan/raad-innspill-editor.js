// handlingsplan/raad-innspill-editor.js

const API_BASE = window.HP_API_BASE || "";
const raadId = new URLSearchParams(location.search).get("id");

const COUNCILS_URL = `${API_BASE}/api/ungdomsrad`;
const INNSPILL_LIST_URL = (id) =>
  `${API_BASE}/api/ungdomsrad/${encodeURIComponent(id)}/innspill`;
const INNSPILL_ITEM_URL = (councilId, innspillId) =>
  `${API_BASE}/api/ungdomsrad/${encodeURIComponent(
    councilId
  )}/innspill/${encodeURIComponent(innspillId)}`;

let raadPassword = "";
let innspillState = [];
let editingId = null;
let isLoggedIn = false;

// ---- COOKIE HELPERS (deles med raad-admin) ----
const PW_COOKIE_NAME = raadId ? `raad_admin_pw_${raadId}` : null;

function setPasswordCookie(pw) {
  if (!PW_COOKIE_NAME) return;
  const days = 1;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${PW_COOKIE_NAME}=${encodeURIComponent(
    pw
  )}; expires=${expires}; path=/handlingsplan/`;
}

function getPasswordFromCookie() {
  if (!PW_COOKIE_NAME) return "";
  const name = PW_COOKIE_NAME + "=";
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const c = part.trim();
    if (c.startsWith(name)) {
      return decodeURIComponent(c.substring(name.length));
    }
  }
  return "";
}

function clearPasswordCookie() {
  if (!PW_COOKIE_NAME) return;
  document.cookie = `${PW_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/handlingsplan/`;
}

// ---- DOM helpers ----
function $(id) {
  return document.getElementById(id);
}

function updateLoginVisibility() {
  const loginSection = $("login-section");
  const adminSection = $("admin-section");
  if (!loginSection || !adminSection) return;

  if (isLoggedIn) {
    loginSection.style.display = "none";
    adminSection.style.display = "block";
  } else {
    loginSection.style.display = "block";
    adminSection.style.display = "none";
  }
}


// ---- API helpers ----

async function fetchCouncil(id) {
  const res = await fetch(`${COUNCILS_URL}/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error("Kunne ikke hente ungdomsråd.");
  }
  return await res.json();
}

async function fetchInnspill(id) {
  const res = await fetch(INNSPILL_LIST_URL(id));
  if (!res.ok) {
    throw new Error("Kunne ikke hente innspill.");
  }
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

function initBackLink() {
  const backLink = $("back-link");
  if (backLink && raadId) {
    backLink.href = `raad-admin.html?id=${encodeURIComponent(raadId)}`;
  }
}

function updateHeaderBrand(council) {
  if (!council) return;

  const brandImg =
    document.getElementById("raadBrandLogo") ||
    document.querySelector(".header .brand");
  if (!brandImg) return;

  const name = council.display_name || council.name || "Ungdomsråd";

  let logoSrc = "../UFR-logo.png";

  if (council.has_logo) {
    logoSrc = `${API_BASE}/api/ungdomsrad/${encodeURIComponent(
      council.id
    )}/logo-file?cacheBust=${Date.now()}`;
  }

  brandImg.src = logoSrc;
  brandImg.alt = `Logo for ${name}`;
}

// --- Tema-rekkefølge (samme som i karusellen på råd-siden) ---

let CURRENT_TEMA_ORDER = [];

function setTemaOrderFromCouncil(council) {
  const temaer = Array.isArray(council?.temaer) ? council.temaer : [];

  if (temaer.length > 0) {
    CURRENT_TEMA_ORDER = [];
    temaer.forEach((t) => {
      const name = t.name || "";
      if (!name) return;
      CURRENT_TEMA_ORDER.push(name);
    });
  } else {
    // Fallback til samme standardrekkefølge som råd-siden
    CURRENT_TEMA_ORDER = [
      "Ungdomsdemokrati og Medvirkning",
      "Samferdsel",
      "Utdanning og Kompetanse",
      "Folkehelse",
      "Klima og Miljø",
      "Kultur",
    ];
  }
}

function getTemaSortIndex(tema) {
  if (!CURRENT_TEMA_ORDER.length) return 0;
  const idx = CURRENT_TEMA_ORDER.indexOf(tema || "");
  // Ukjente/gamle temaer havner til slutt
  return idx === -1 ? CURRENT_TEMA_ORDER.length + 1 : idx;
}


function formatAction(actionType) {
  const actionMap = {
    add: "Legge til punkt",
    change: "Endre punkt",
    remove: "Fjerne punkt",
  };
  return actionMap[actionType] || actionType || "";
}

function formatPunkt(punktNr, underpunktNr) {
  if (
    underpunktNr !== null &&
    underpunktNr !== undefined &&
    underpunktNr !== ""
  ) {
    return `${punktNr ?? ""}.${underpunktNr}`;
  }
  return punktNr ?? "";
}

function parsePunktInput(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return { punktNr: null, underpunktNr: null };

  const parts = trimmed.split(".");
  if (parts.length === 1) {
    const main = parseInt(parts[0], 10);
    return {
      punktNr: Number.isNaN(main) ? null : main,
      underpunktNr: null,
    };
  }

  const main = parseInt(parts[0], 10);
  const sub = parseInt(parts[1], 10);
  return {
    punktNr: Number.isNaN(main) ? null : main,
    underpunktNr: Number.isNaN(sub) ? null : sub,
  };
}

function formatCreatedAt(createdAt) {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return createdAt;
  return d.toLocaleString("nb-NO", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

// ---- LOGIN LOGIC ----

function initLoginModule() {
  const loginBtn = $("raad-login-btn");
  const pwInput = $("raad-password");
  const errorEl = $("raad-login-error");

  // 1) Sjekk cookie først – hvis vi har pw der, auto-logg inn
  const cookiePw = getPasswordFromCookie();
  if (cookiePw) {
    raadPassword = cookiePw;
    isLoggedIn = true;
    if (pwInput) pwInput.value = "";
    if (errorEl) errorEl.textContent = "";
    updateLoginVisibility();
  }

  // 2) Manuell login
  if (loginBtn && pwInput) {
    loginBtn.addEventListener("click", () => {
      const pw = pwInput.value.trim();
      if (!pw) {
        if (errorEl) {
          errorEl.textContent = "Vennligst skriv inn passord.";
        }
        return;
      }

      raadPassword = pw;
      isLoggedIn = true;
      setPasswordCookie(pw);
      if (errorEl) errorEl.textContent = "";
      updateLoginVisibility();
    });
  }
}


function ensurePassword() {
  // Hvis allerede satt i minnet og vi anser oss som innlogget
  if (raadPassword && isLoggedIn) return true;

  // Prøv cookie
  const cookiePw = getPasswordFromCookie();
  if (cookiePw) {
    raadPassword = cookiePw;
    isLoggedIn = true;
    updateLoginVisibility();
    return true;
  }

  // Ellers: be brukeren logge inn
  const errorEl = $("raad-login-error");
  if (errorEl) {
    errorEl.textContent =
      "Du må logge inn med admin-passord for å endre eller slette innspill.";
  }
  isLoggedIn = false;
  updateLoginVisibility();
  return false;
}


// ---- EDIT / DELETE HANDLERS ----

function setEditing(id) {
  editingId = id;
  renderInnspillTable();
}

async function handleVedtattToggleClick(id, nextState) {
  if (!ensurePassword()) return;

  try {
    const res = await fetch(INNSPILL_ITEM_URL(raadId, id), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        password: raadPassword,
        // prøver å støtte begge varianter backend kan ha
        vedtatt: nextState,
        status: nextState ? "vedtatt" : "ny",
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg =
        data && data.error
          ? data.error
          : "Det oppstod en feil ved oppdatering av vedtatt-status.";
      alert(msg);
      return;
    }

    const updated = await res.json();

    // Oppdater lokal state
    innspillState = innspillState.map((item) =>
      item.id === id ? { ...item, ...updated } : item
    );

    renderInnspillTable();
  } catch (err) {
    console.error(err);
    alert("Det oppstod en teknisk feil ved oppdatering av vedtatt-status.");
  }
}

async function handleVedtattToggleClick(id, nextIsVedtatt) {
  if (!ensurePassword()) return;

  // Finn eksisterende innspill i state, så vi kan sende full pakke til backend
  const current = innspillState.find((item) => item.id === id);
  if (!current) return;

  const nextStatus = nextIsVedtatt ? "vedtatt" : "ny";

  try {
    const res = await fetch(INNSPILL_ITEM_URL(raadId, id), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        password: raadPassword,
        tema: current.tema,
        punktNr: current.punkt_nr,
        underpunktNr: current.underpunkt_nr,
        formulerPunkt: current.formuler_punkt,
        endreFra: current.endre_fra,
        endreTil: current.endre_til,
        status: nextStatus,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg =
        data && data.error
          ? data.error
          : "Det oppstod en feil ved oppdatering av vedtatt-status.";
      alert(msg);
      return;
    }

    const updated = await res.json();

    // Oppdater lokal state (inkludert status)
    innspillState = innspillState.map((item) =>
      item.id === id ? { ...item, ...updated } : item
    );

    renderInnspillTable();
  } catch (err) {
    console.error(err);
    alert("Det oppstod en teknisk feil ved oppdatering av vedtatt-status.");
  }
}


async function handleSaveClick(id) {
  if (!ensurePassword()) return;

  const row = document.querySelector(`tr[data-innspill-id="${id}"]`);
  if (!row) return;

  const temaInput = row.querySelector(".innspill-input-tema");
  const punktInput = row.querySelector(".innspill-input-punkt");
  const formulerInput = row.querySelector(".innspill-input-formuler");
  const endreFraInput = row.querySelector(".innspill-input-endre-fra");
  const endreTilInput = row.querySelector(".innspill-input-endre-til");

  const tema = temaInput ? temaInput.value.trim() : "";
  const punktRaw = punktInput ? punktInput.value : "";
  const { punktNr, underpunktNr } = parsePunktInput(punktRaw);
  const formulerPunkt = formulerInput ? formulerInput.value.trim() : "";
  const endreFra = endreFraInput ? endreFraInput.value.trim() : "";
  const endreTil = endreTilInput ? endreTilInput.value.trim() : "";

  try {
    const res = await fetch(INNSPILL_ITEM_URL(raadId, id), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        password: raadPassword,
        tema,
        punktNr,
        underpunktNr,
        formulerPunkt,
        endreFra,
        endreTil,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg =
        data && data.error
          ? data.error
          : "Det oppstod en feil ved lagring av innspillet.";
      alert(msg);
      return;
    }

    const updated = await res.json();

    // Oppdater lokal state
    innspillState = innspillState.map((item) =>
      item.id === id ? { ...item, ...updated } : item
    );

    editingId = null;
    renderInnspillTable();
  } catch (err) {
    console.error(err);
    alert("Det oppstod en teknisk feil ved lagring av innspillet.");
  }
}

async function handleDeleteClick(id) {
  if (!ensurePassword()) return;

  if (!confirm("Er du sikker på at du vil slette dette innspillet?")) {
    return;
  }

  try {
    const res = await fetch(INNSPILL_ITEM_URL(raadId, id), {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: raadPassword }),
    });

    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      const msg =
        data && data.error
          ? data.error
          : "Det oppstod en feil ved sletting av innspillet.";
      alert(msg);
      return;
    }

    // Fjern fra state
    innspillState = innspillState.filter((item) => item.id !== id);
    if (editingId === id) editingId = null;

    renderInnspillTable();
  } catch (err) {
    console.error(err);
    alert("Det oppstod en teknisk feil ved sletting av innspillet.");
  }
}

// ---- RENDER TABELL ----

function renderInnspillTable() {
  const wrapper = $("innspill-table-wrapper");
  if (!wrapper) return;

  if (!innspillState.length) {
    wrapper.innerHTML =
      "<p>Det er ikke registrert noen innspill for dette ungdomsrådet ennå.</p>";
    return;
  }

    // Sorter på tema-rekkefølge (samme som karusell), punkt, underpunkt, created_at
    const sorted = innspillState.slice().sort((a, b) => {
        const idxA = getTemaSortIndex(a.tema || "");
        const idxB = getTemaSortIndex(b.tema || "");
        if (idxA !== idxB) return idxA - idxB;

        const pA = a.punkt_nr ?? 0;
        const pB = b.punkt_nr ?? 0;
        if (pA !== pB) return pA - pB;

        const uA = a.underpunkt_nr ?? 0;
        const uB = b.underpunkt_nr ?? 0;
        if (uA !== uB) return uA - uB;

        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tA - tB;
    });


  wrapper.innerHTML = "";

  const table = document.createElement("table");
  table.classList.add("innspill-table");

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.classList.add("innspill-head-row");

  [
    "Tema",
    "Hva vil du gjøre?",
    "Punkt (nr)",
    "Formuler punktet",
    "Endre fra",
    "Endre til",
    "Handlinger",
  ].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  sorted.forEach((s) => {
    const isEditing = editingId === s.id;
    const tr = document.createElement("tr");
    tr.dataset.innspillId = s.id;

    const isVedtatt =
      s.status === "vedtatt" ||
      s.vedtatt === true ||
      s.vedtatt === "true";

    if (isVedtatt) {
      tr.classList.add("vedtatt");
      tr.dataset.status = "vedtatt";
    }


    // Tema
    const tdTema = document.createElement("td");
    if (isEditing) {
      const input = document.createElement("input");
      input.type = "text";
      input.value = s.tema || "";
      input.className = "innspill-input innspill-input-tema";
      tdTema.appendChild(input);
    } else {
      tdTema.textContent = s.tema || "";
    }
    tr.appendChild(tdTema);

    // Action type (ikke redigerbar her)
    const tdAction = document.createElement("td");
    tdAction.textContent = formatAction(s.action_type);
    tr.appendChild(tdAction);

    // Punkt
    const tdPunkt = document.createElement("td");
    if (isEditing) {
      const input = document.createElement("input");
      input.type = "text";
      input.value = formatPunkt(s.punkt_nr, s.underpunkt_nr) || "";
      input.className = "innspill-input innspill-input-punkt";
      tdPunkt.appendChild(input);
    } else {
      tdPunkt.textContent = formatPunkt(s.punkt_nr, s.underpunkt_nr);
    }
    tr.appendChild(tdPunkt);

    // Formuler punkt
    const tdFormuler = document.createElement("td");
    if (isEditing) {
      const textarea = document.createElement("textarea");
      textarea.className = "innspill-input innspill-input-formuler";
      textarea.rows = 2;
      textarea.value = s.formuler_punkt || "";
      tdFormuler.appendChild(textarea);
    } else {
      tdFormuler.textContent = s.formuler_punkt || "";
    }
    tr.appendChild(tdFormuler);

    // Endre fra
    const tdEndreFra = document.createElement("td");
    if (isEditing) {
      const textarea = document.createElement("textarea");
      textarea.className = "innspill-input innspill-input-endre-fra";
      textarea.rows = 2;
      textarea.value = s.endre_fra || "";
      tdEndreFra.appendChild(textarea);
    } else {
      tdEndreFra.textContent = s.endre_fra || "";
    }
    tr.appendChild(tdEndreFra);

    // Endre til
    const tdEndreTil = document.createElement("td");
    if (isEditing) {
      const textarea = document.createElement("textarea");
      textarea.className = "innspill-input innspill-input-endre-til";
      textarea.rows = 2;
      textarea.value = s.endre_til || "";
      tdEndreTil.appendChild(textarea);
    } else {
      tdEndreTil.textContent = s.endre_til || "";
    }
    tr.appendChild(tdEndreTil);

    // Handlinger
    const tdActions = document.createElement("td");
    tdActions.className = "button-cell";

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "innspill-actions";

    // ✅ Grønn vedtatt-knapp med "✓"
    const vedtattBtn = document.createElement("button");
    vedtattBtn.type = "button";
    vedtattBtn.className = "btn btn-vedta";
    vedtattBtn.textContent = "✓";
    vedtattBtn.title = isVedtatt
      ? "Fjern vedtatt-status"
      : "Marker innspillet som vedtatt";

    vedtattBtn.addEventListener("click", () =>
      handleVedtattToggleClick(s.id, !isVedtatt)
    );
    actionsWrap.appendChild(vedtattBtn);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-small";
    editBtn.textContent = isEditing ? "Lagre" : "Rediger";
    editBtn.addEventListener("click", () => {
      if (isEditing) {
        handleSaveClick(s.id);
      } else {
        setEditing(s.id);
      }
    });
    actionsWrap.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-delete";
    deleteBtn.textContent = "X";
    deleteBtn.addEventListener("click", () => handleDeleteClick(s.id));
    actionsWrap.appendChild(deleteBtn);

    tdActions.appendChild(actionsWrap);
    tr.appendChild(tdActions);



    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
}

// ---- INIT ----

async function init() {
  if (!raadId) {
    alert("Mangler id for ungdomsråd i URL-en.");
    return;
  }

  initBackLink();
  initLoginModule();
  updateLoginVisibility();

  try {
    const council = await fetchCouncil(raadId);
    const nameSpan = $("raad-name");
    if (nameSpan) {
      nameSpan.textContent = council.display_name || council.name || "";
    }
    updateHeaderBrand(council);
    setTemaOrderFromCouncil(council);

    innspillState = await fetchInnspill(raadId);
    renderInnspillTable();

  } catch (err) {
    console.error(err);
    const wrapper = $("innspill-table-wrapper");
    if (wrapper) {
      wrapper.innerHTML =
        "<p>Det oppstod en feil ved henting av innspill. Prøv igjen senere.</p>";
    }
  }
}

document.addEventListener("DOMContentLoaded", init);
