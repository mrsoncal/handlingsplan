// handlingsplan/raad-admin.js

const API_BASE = window.HP_API_BASE || "";
const raadId = new URLSearchParams(location.search).get("id");

let raadData = null;
let raadPassword = "";
let temaState = [];
let hasUnsavedChanges = false;

// ---- COOKIE HELPERS for per-råd-passord (deles med raad-innspill-editor) ----
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


// ---------- helpers ----------

function $(id) {
  return document.getElementById(id);
}

const TRASH_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 12H8L7 9Z"></path>
  </svg>`;

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function setNotice(element, message, type = "info") {
  if (!element) return;
  element.textContent = message;
  element.dataset.type = message ? type : "";
}

function setDirty(isDirty = true) {
  hasUnsavedChanges = isDirty;
  const indicator = $("unsaved-indicator");
  const saveBtn = $("save-btn");
  if (indicator) {
    indicator.textContent = isDirty
      ? "Du har ulagrede endringer"
      : "";
  }
  if (saveBtn) saveBtn.classList.toggle("has-changes", isDirty);
}

function updateCurrentFiles(council) {
  const logoCurrent = $("logo-current");
  const logoPreview = $("logo-preview");
  if (logoCurrent && logoPreview && council?.has_logo) {
    const version = council.logo_version
      ? `?v=${encodeURIComponent(council.logo_version)}`
      : "";
    logoPreview.src = `${API_BASE}/api/ungdomsrad/${encodeURIComponent(raadId)}/logo-file${version}`;
    logoCurrent.hidden = false;
  }

  const hpCurrent = $("hp-current");
  if (hpCurrent && council?.has_handlingsplan) {
    hpCurrent.href = `${API_BASE}/api/ungdomsrad/${encodeURIComponent(raadId)}/handlingsplan-file`;
    hpCurrent.hidden = false;
  }
}

function getFormsShareUrl() {
  const url = new URL("forms.html", window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("raadId", raadId);
  return url.toString();
}

function renderShareTools() {
  if (!raadId) return;

  const shareUrl = getFormsShareUrl();
  const urlInput = $("forms-share-url");
  const qrContainer = $("forms-qr-code");

  if (urlInput) urlInput.value = shareUrl;
  if (!qrContainer) return;

  qrContainer.innerHTML = "";
  if (typeof window.qrcode !== "function") {
    qrContainer.textContent = "QR-koden kunne ikke lastes. Bruk direktelenken.";
    qrContainer.classList.add("forms-qr-code-error");
    return;
  }

  const qr = window.qrcode(0, "M");
  qr.addData(shareUrl);
  qr.make();
  const qrImage = document.createElement("img");
  qrImage.src = qr.createDataURL(8, 4);
  qrImage.alt = "QR-kode til skjemaet for innspill";
  qrImage.title = "Høyreklikk for å lagre QR-koden som bilde";
  qrContainer.appendChild(qrImage);
}

async function copyFormsLink() {
  const input = $("forms-share-url");
  const statusEl = $("copy-link-status");
  if (!input) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(input.value);
    } else {
      input.focus();
      input.select();
      document.execCommand("copy");
      input.setSelectionRange(0, 0);
    }
    setNotice(statusEl, "Lenken er kopiert.", "success");
  } catch (err) {
    console.error(err);
    setNotice(statusEl, "Kunne ikke kopiere automatisk. Marker lenken og kopier den manuelt.", "error");
  }
}

function ensurePassword() {
  if (raadPassword) return true;

  const errorEl = $("raad-login-error");

  // 1) Prøv cookie først
  const cookiePw = getPasswordFromCookie();
  if (cookiePw) {
    raadPassword = cookiePw;
    if (errorEl) errorEl.textContent = "";
    return true;
  }

  // 2) Ellers: les fra input-feltet
  const pwInput = $("raad-password");
  const pw = pwInput ? pwInput.value.trim() : "";

  if (!pw) {
    if (errorEl) {
      errorEl.textContent =
        "Skriv inn admin-passordet som ble satt da ungdomsrådet ble opprettet.";
    }
    return false;
  }

  raadPassword = pw;
  if (errorEl) errorEl.textContent = "";
  setPasswordCookie(raadPassword); // viktig: lagre cookie
  return true;
}

function autoLoginFromCookie() {
  const loginSection = $("login-section");
  const adminSection = $("admin-section");
  const cookiePw = getPasswordFromCookie();
  if (!cookiePw) return;

  // Bruk passordet fra cookie uten å vise feilmelding
  raadPassword = cookiePw;
  if (loginSection) loginSection.style.display = "none";
  if (adminSection) adminSection.style.display = "block";
  const logoutBtn = $("admin-logout-btn");
  if (logoutBtn) logoutBtn.hidden = false;
}



// ---------- initial data ----------

async function fetchCouncil() {
  if (!raadId) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/ungdomsrad/${encodeURIComponent(raadId)}`
    );
    if (!res.ok) {
      throw new Error("Kunne ikke hente ungdomsråd.");
    }

    raadData = await res.json();

    const displayName =
      raadData.display_name || raadData.name || "Ukjent ungdomsråd";

    setText("raad-name", displayName);
    setText("breadcrumb-council", displayName);
    const breadcrumbCouncilLink = $("breadcrumb-council-link");
    if (breadcrumbCouncilLink) {
      breadcrumbCouncilLink.href = `raad.html?id=${encodeURIComponent(raadId)}`;
    }

    const nameInput = $("raad-name-input");
    if (nameInput) nameInput.value = displayName;

    updateHeaderBrand(raadData);
    updateCurrentFiles(raadData);

    // Bygg tema-state
    const fromApi = Array.isArray(raadData.temaer) ? raadData.temaer : [];
    temaState = fromApi.map((t, idx) => ({
      id: t.id || idx + 1,
      name: t.name || "",
      color: t.color || "#0088cc",
      allowAdd: t.allowAdd !== false,
      allowChange: t.allowChange !== false,
      allowRemove: t.allowRemove !== false,
      position:
        typeof t.position === "number" ? t.position : idx,
    }));

    renderTemaList();
  } catch (err) {
    console.error(err);
    alert("Kunne ikke hente data for dette ungdomsrådet.");
  }
}

function initBackLink() {
  const backLink = $("back-link");
  if (backLink && raadId) {
    backLink.href = `raad.html?id=${encodeURIComponent(raadId)}`;
  }
}

// ---------- login ----------

function initLogin() {
  const loginBtn = $("raad-login-btn");
  const loginSection = $("login-section");
  const adminSection = $("admin-section");

  if (!loginBtn) return;

  loginBtn.addEventListener("click", () => {
    if (!ensurePassword()) return;

    if (loginSection) loginSection.style.display = "none";
    if (adminSection) adminSection.style.display = "block";
    const logoutBtn = $("admin-logout-btn");
    if (logoutBtn) logoutBtn.hidden = false;
  });
}

// ---------- logo & handlingsplan ----------

async function uploadLogo() {
  if (!ensurePassword()) return;

  const fileInput = $("raad-logo");
  const statusEl = $("logo-status");

  if (!fileInput || !fileInput.files.length) {
    setNotice(statusEl, "Velg en logofil først.", "error");
    return;
  }

  setNotice(statusEl, "Laster opp logo…");

  const fd = new FormData();
  fd.append("logo", fileInput.files[0]);
  fd.append("password", raadPassword);

  try {
    const res = await fetch(
      `${API_BASE}/api/ungdomsrad/${encodeURIComponent(raadId)}/logo`,
      {
        method: "POST",
        body: fd,
      }
    );

    if (!res.ok) {
      let msg = "Kunne ikke laste opp logo.";
      try {
        const err = await res.json();
        if (err && err.error) msg = err.error;
      } catch (_) {}
      setNotice(statusEl, msg, "error");
      return;
    }

    raadData = await res.json();
    updateHeaderBrand(raadData);
    updateCurrentFiles(raadData);
    fileInput.value = "";
    setText("logoFileName", "Ingen fil valgt");
    setNotice(statusEl, "Logoen er lastet opp.", "success");
  } catch (err) {
    console.error(err);
    setNotice(statusEl, "Det oppstod en feil ved opplasting av logo.", "error");
  }
}

async function uploadHandlingsplan() {
  if (!ensurePassword()) return;

  const fileInput = $("raad-handlingsplan");
  const statusEl = $("hp-status");

  if (!fileInput || !fileInput.files.length) {
    setNotice(statusEl, "Velg en fil for handlingsplanen først.", "error");
    return;
  }

  setNotice(statusEl, "Laster opp handlingsplan…");

  const fd = new FormData();
  fd.append("handlingsplan", fileInput.files[0]);
  fd.append("password", raadPassword);

  try {
    const res = await fetch(
      `${API_BASE}/api/ungdomsrad/${encodeURIComponent(
        raadId
      )}/handlingsplan`,
      {
        method: "POST",
        body: fd,
      }
    );

    if (!res.ok) {
      let msg = "Kunne ikke laste opp handlingsplan.";
      try {
        const err = await res.json();
        if (err && err.error) msg = err.error;
      } catch (_) {}
      setNotice(statusEl, msg, "error");
      return;
    }

    raadData = await res.json();
    updateCurrentFiles(raadData);
    fileInput.value = "";
    setText("hpFileName", "Ingen fil valgt");
    setNotice(statusEl, "Handlingsplanen er lastet opp.", "success");
  } catch (err) {
    console.error(err);
    setNotice(statusEl, "Det oppstod en feil ved opplasting av handlingsplanen.", "error");
  }
}

// ---------- tema-editor ----------

function renderTemaList() {
  const container = $("tema-list");
  if (!container) return;

  container.innerHTML = "";

  if (!temaState.length) {
    const empty = document.createElement("p");
    empty.textContent = "Ingen temaer definert enda.";
    empty.style.opacity = "0.7";
    container.appendChild(empty);
    return;
  }

  temaState.forEach((t, index) => {
    const row = document.createElement("div");
    row.className = "form-row tema-grid-row";

    // Navn
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "input";
    nameInput.value = t.name || "";
    nameInput.placeholder = "Tema (f.eks. Skole)";
    nameInput.addEventListener("input", (e) => {
      temaState[index].name = e.target.value;
      setDirty();
    });
    row.appendChild(nameInput);

    // Farge
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "tema-color-input";
    colorInput.value = t.color || "#0088cc";
    colorInput.setAttribute("aria-label", `Farge for ${t.name || "temaet"}`);
    colorInput.addEventListener("input", (e) => {
      temaState[index].color = e.target.value;
      setDirty();
    });
    row.appendChild(colorInput);

    // Legge til
    const addLabel = document.createElement("label");
    const addCheckbox = document.createElement("input");
    addCheckbox.type = "checkbox";
    addCheckbox.checked = t.allowAdd !== false;
    addCheckbox.addEventListener("change", (e) => {
      temaState[index].allowAdd = e.target.checked;
    });
    addLabel.appendChild(addCheckbox);
    addLabel.setAttribute("aria-label", `Tillat å legge til punkt i ${t.name || "temaet"}`);
    addCheckbox.addEventListener("change", () => setDirty());
    row.appendChild(addLabel);

    // Endre
    const changeLabel = document.createElement("label");
    const changeCheckbox = document.createElement("input");
    changeCheckbox.type = "checkbox";
    changeCheckbox.checked = t.allowChange !== false;
    changeCheckbox.addEventListener("change", (e) => {
      temaState[index].allowChange = e.target.checked;
    });
    changeLabel.appendChild(changeCheckbox);
    changeLabel.setAttribute("aria-label", `Tillat å endre punkt i ${t.name || "temaet"}`);
    changeCheckbox.addEventListener("change", () => setDirty());
    row.appendChild(changeLabel);

    // Fjerne
    const removeLabel = document.createElement("label");
    const removeCheckbox = document.createElement("input");
    removeCheckbox.type = "checkbox";
    removeCheckbox.checked = t.allowRemove !== false;
    removeCheckbox.addEventListener("change", (e) => {
      temaState[index].allowRemove = e.target.checked;
    });
    removeLabel.appendChild(removeCheckbox);
    removeLabel.setAttribute("aria-label", `Tillat å fjerne punkt i ${t.name || "temaet"}`);
    removeCheckbox.addEventListener("change", () => setDirty());
    row.appendChild(removeLabel);

    const orderActions = document.createElement("div");
    orderActions.className = "tema-order-actions";
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "btn-icon";
    upBtn.textContent = "↑";
    upBtn.title = "Flytt tema opp";
    upBtn.setAttribute("aria-label", `Flytt ${t.name || "temaet"} opp`);
    upBtn.disabled = index === 0;
    upBtn.addEventListener("click", () => moveTema(index, -1));
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "btn-icon";
    downBtn.textContent = "↓";
    downBtn.title = "Flytt tema ned";
    downBtn.setAttribute("aria-label", `Flytt ${t.name || "temaet"} ned`);
    downBtn.disabled = index === temaState.length - 1;
    downBtn.addEventListener("click", () => moveTema(index, 1));
    orderActions.append(upBtn, downBtn);
    row.appendChild(orderActions);

    // Slett-knapp
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-delete btn-icon-only";
    deleteBtn.innerHTML = TRASH_ICON_SVG;
    deleteBtn.setAttribute("aria-label", `Slett temaet ${t.name || "uten navn"}`);
    deleteBtn.title = "Slett tema";
    deleteBtn.addEventListener("click", () => {
      const themeName = temaState[index]?.name || "dette temaet";
      if (!window.confirm(`Vil du slette temaet «${themeName}»? Endringen lagres først når du velger Lagre endringer.`)) return;
      temaState.splice(index, 1);
      setDirty();
      renderTemaList();
    });
    row.appendChild(deleteBtn);

    container.appendChild(row);
  });
}

function updateHeaderBrand(council) {
  window.HPBrand?.update(council, API_BASE);
}


function addTema() {
  temaState.push({
    id: Date.now(),
    name: "",
    color: "#0088cc",
    allowAdd: true,
    allowChange: true,
    allowRemove: true,
    position: temaState.length,
  });
  setDirty();
  renderTemaList();
}

function moveTema(index, offset) {
  const targetIndex = index + offset;
  if (targetIndex < 0 || targetIndex >= temaState.length) return;
  [temaState[index], temaState[targetIndex]] = [temaState[targetIndex], temaState[index]];
  temaState.forEach((theme, position) => {
    theme.position = position;
  });
  setDirty();
  renderTemaList();
}

// ---------- lagre navn + tema-oppsett ----------

async function saveConfig() {
  if (!ensurePassword()) return;

  const statusEl = $("save-status");
  const saveBtn = $("save-btn");

  setNotice(statusEl, "Lagrer endringer…");
  if (saveBtn) saveBtn.disabled = true;

  const nameInput = $("raad-name-input");
  const displayName = (nameInput?.value || "").trim();

  const cleanedTemaer = temaState
    .map((t, index) => {
      const name = (t.name || "").trim();
      if (!name) return null;
      return {
        name,
        color: t.color || null,
        allowAdd: t.allowAdd !== false,
        allowChange: t.allowChange !== false,
        allowRemove: t.allowRemove !== false,
        position: index,
      };
    })
    .filter(Boolean);

  try {
    const res = await fetch(
      `${API_BASE}/api/ungdomsrad/${encodeURIComponent(
        raadId
      )}/admin-config`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: raadPassword,
          displayName,
          temaer: cleanedTemaer,
        }),
      }
    );

    if (!res.ok) {
      let msg = "Kunne ikke lagre oppsettet.";
      try {
        const err = await res.json();
        if (err && err.error) msg = err.error;
      } catch (_) {}
      setNotice(statusEl, msg, "error");
      return;
    }

    const updated = await res.json();
    raadData = updated;

    // Oppdater visning basert på svar fra backend
    const newName =
      updated.display_name || updated.name || displayName;
    setText("raad-name", newName);
    if (nameInput) nameInput.value = newName;

    const fromApi = Array.isArray(updated.temaer)
      ? updated.temaer
      : [];
    temaState = fromApi.map((t, idx) => ({
      id: t.id || idx + 1,
      name: t.name || "",
      color: t.color || "#0088cc",
      allowAdd: t.allowAdd !== false,
      allowChange: t.allowChange !== false,
      allowRemove: t.allowRemove !== false,
      position:
        typeof t.position === "number" ? t.position : idx,
    }));
    renderTemaList();

    setDirty(false);
    setNotice(statusEl, "Endringene er lagret.", "success");
  } catch (err) {
    console.error(err);
    setNotice(statusEl, "Det oppstod en feil ved lagring.", "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// ---------- init ----------

function initButtons() {
  const logoBtn = $("upload-logo-btn");
  const hpBtn = $("upload-hp-btn");
  const addTemaBtn = $("add-tema-btn");
  const saveBtn = $("save-btn");
  const innspillEditorBtn = $("open-innspill-editor-btn");
  const copyFormsLinkBtn = $("copy-forms-link");
  const logoutBtn = $("admin-logout-btn");

  if (logoBtn) logoBtn.addEventListener("click", uploadLogo);
  if (hpBtn) hpBtn.addEventListener("click", uploadHandlingsplan);
  if (addTemaBtn) addTemaBtn.addEventListener("click", addTema);
  if (saveBtn) saveBtn.addEventListener("click", saveConfig);
  if (copyFormsLinkBtn) copyFormsLinkBtn.addEventListener("click", copyFormsLink);
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (hasUnsavedChanges && !window.confirm("Du har ulagrede endringer. Vil du logge ut likevel?")) return;
      setDirty(false);
      raadPassword = "";
      clearPasswordCookie();
      logoutBtn.hidden = true;
      const loginSection = $("login-section");
      const adminSection = $("admin-section");
      if (loginSection) loginSection.style.display = "block";
      if (adminSection) adminSection.style.display = "none";
      const passwordInput = $("raad-password");
      if (passwordInput) passwordInput.value = "";
    });
  }
  if (innspillEditorBtn && raadId) {
    innspillEditorBtn.addEventListener("click", () => {
      window.location.href = `raad-innspill-editor.html?id=${encodeURIComponent(
        raadId
      )}`;
    });
  }

  const nameInput = $("raad-name-input");
  if (nameInput) nameInput.addEventListener("input", () => setDirty());

  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedChanges) return;
    event.preventDefault();
    event.returnValue = "";
  });
}



document.addEventListener("DOMContentLoaded", async () => {

  const themeList = $("tema-list");
  if (themeList) {
    themeList.innerHTML = '<div class="skeleton-panel" aria-label="Laster temaer" aria-busy="true"><span class="skeleton-line"></span><span class="skeleton-line"></span></div>';
  }

  $("raad-logo").addEventListener("change", () => {
    $("logoFileName").textContent =
      $("raad-logo").files[0]?.name || "Ingen fil valgt";
  });

  $("raad-handlingsplan").addEventListener("change", () => {
    $("hpFileName").textContent =
      $("raad-handlingsplan").files[0]?.name || "Ingen fil valgt";
  });


  initBackLink();
  renderShareTools();
  await fetchCouncil();
  autoLoginFromCookie();
  initLogin();
  initButtons();
});
