// handlingsplan/raad-admin.js

const API_BASE = window.HP_API_BASE || "";
const raadId = new URLSearchParams(location.search).get("id");

let raadData = null;
let temaState = [];
let hasUnsavedChanges = false;
let acceptingInnspill = true;
let councilSession = raadId ? window.HPCouncilSession?.get(raadId) : null;
let councilToken = councilSession?.token || "";

function councilAuthHeaders() {
  return councilToken ? { "X-Council-Session": councilToken } : {};
}

const COUNCIL_SESSION_URL = raadId
  ? `${API_BASE}/api/ungdomsrad/${encodeURIComponent(raadId)}/session`
  : "";


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

function renderInnspillCollectionState() {
  const stateEl = $("innspill-collection-state");
  const toggleBtn = $("toggle-innspill-collection-btn");

  if (stateEl) {
    stateEl.textContent = acceptingInnspill
      ? "Innsamling av innspill er åpen."
      : "Innsamling av innspill er blokkert.";
  }

  if (toggleBtn) {
    toggleBtn.textContent = acceptingInnspill
      ? "Blokker innsamling"
      : "Åpne for innspill";
    toggleBtn.setAttribute("aria-pressed", String(!acceptingInnspill));
    toggleBtn.classList.toggle("is-open", acceptingInnspill);
    toggleBtn.classList.toggle("is-blocked", !acceptingInnspill);
  }
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
  if (councilToken) return true;
  window.HPCouncilSession?.require(raadId);
  return false;
}

async function copyPublicPageLink() {
  const link = $("open-public-plan");
  const statusEl = $("copy-public-plan-status");
  if (!link || !raadId) return;

  const url = link.href;
  setNotice(statusEl, "Kopierer lenken …");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement("textarea");
      input.value = url;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      let copied = false;
      try {
        input.select();
        copied = document.execCommand("copy");
      } finally {
        input.remove();
      }
      if (!copied) throw new Error("Kunne ikke kopiere lenken");
    }
    setNotice(statusEl, "Lenken er kopiert.", "success");
  } catch (err) {
    console.error(err);
    setNotice(statusEl, "Kunne ikke kopiere lenken. Åpne rådssiden og kopier adressen derfra.", "error");
  }
}

function showAdmin() {
  const adminSection = $("admin-section");
  if (adminSection) adminSection.style.display = "block";
  const loadStatus = $("admin-load-status");
  if (loadStatus) loadStatus.hidden = true;
  const logoutBtn = $("admin-logout-btn");
  if (logoutBtn) logoutBtn.hidden = false;
}

async function autoLoginFromSession() {
  councilSession = raadId ? window.HPCouncilSession?.get(raadId) : null;
  councilToken = councilSession?.token || "";
  if (!councilToken) {
    window.HPCouncilSession?.require(raadId);
    return false;
  }
  try {
    const response = await fetch(COUNCIL_SESSION_URL, {
      headers: councilAuthHeaders(),
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      window.HPCouncilSession?.clear(raadId);
      window.location.replace(`raad-oversikt.html?council=${encodeURIComponent(raadId)}`);
      return false;
    }
    if (!response.ok) throw new Error("Rådstilgangen kunne ikke kontrolleres.");
    showAdmin();
    return true;
  } catch {
    const loadStatus = $("admin-load-status");
    if (loadStatus) loadStatus.textContent = "Kunne ikke kontakte rådet. Last siden på nytt for å prøve igjen.";
    return false;
  }
}



// ---------- initial data ----------

async function fetchCouncil() {
  if (!raadId) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/ungdomsrad/${encodeURIComponent(raadId)}`
    );
    if (!res.ok) {
      throw new Error("Kunne ikke hente siden.");
    }

    raadData = await res.json();
    acceptingInnspill = raadData.accepting_innspill !== false;
    renderInnspillCollectionState();

    const displayName =
      raadData.display_name || raadData.name || "Ukjent råd eller organisasjon";

    setText("raad-name", displayName);
    setText("breadcrumb-council", displayName);
    const breadcrumbCouncilLink = $("breadcrumb-council-link");
    if (breadcrumbCouncilLink) {
      breadcrumbCouncilLink.href = `raad-portal.html?id=${encodeURIComponent(raadId)}`;
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
    const loadStatus = $("admin-load-status");
    if (loadStatus) {
      loadStatus.hidden = false;
      loadStatus.textContent = "Kunne ikke hente rådsdata. Last siden på nytt for å prøve igjen.";
    }
  }
}

async function toggleInnspillCollection() {
  if (!ensurePassword()) return;

  const toggleBtn = $("toggle-innspill-collection-btn");
  const statusEl = $("innspill-collection-status");
  const nextValue = !acceptingInnspill;

  if (toggleBtn) toggleBtn.disabled = true;
  setNotice(
    statusEl,
    nextValue ? "Åpner for innspill…" : "Blokkerer innsamling…"
  );

  try {
    const res = await fetch(
      `${API_BASE}/api/ungdomsrad/${encodeURIComponent(raadId)}/admin-config`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...councilAuthHeaders() },
        body: JSON.stringify({
          acceptingInnspill: nextValue,
        }),
      }
    );

    const updated = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice(
        statusEl,
        updated.error || "Kunne ikke endre innsamlingen av innspill.",
        "error"
      );
      return;
    }

    raadData = updated;
    acceptingInnspill = updated.accepting_innspill !== false;
    renderInnspillCollectionState();
    window.HPInnspillSync?.notify(raadId);
    setNotice(
      statusEl,
      acceptingInnspill
        ? "Skjemaet er åpnet for nye innspill."
        : "Skjemaet er blokkert for nye innspill.",
      "success"
    );
  } catch (err) {
    console.error(err);
    setNotice(
      statusEl,
      "Det oppstod en feil ved endring av innsamlingen.",
      "error"
    );
  } finally {
    if (toggleBtn) toggleBtn.disabled = false;
  }
}

function initBackLink() {
  const backLink = $("back-link");
  if (backLink) backLink.href = `raad-portal.html?id=${encodeURIComponent(raadId)}`;
  const publicPlan = $("open-public-plan");
  if (publicPlan) publicPlan.href = `raad.html?id=${encodeURIComponent(raadId)}`;
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

  try {
    const res = await fetch(
      `${API_BASE}/api/ungdomsrad/${encodeURIComponent(raadId)}/logo`,
      {
        method: "POST",
        headers: councilAuthHeaders(),
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

  try {
    const res = await fetch(
      `${API_BASE}/api/ungdomsrad/${encodeURIComponent(
        raadId
      )}/handlingsplan`,
      {
        method: "POST",
        headers: councilAuthHeaders(),
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
          ...councilAuthHeaders(),
        },
        body: JSON.stringify({
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
    acceptingInnspill = updated.accepting_innspill !== false;
    renderInnspillCollectionState();

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
  const collectionToggleBtn = $("toggle-innspill-collection-btn");
  const copyFormsLinkBtn = $("copy-forms-link");
  const copyPublicPageLinkBtn = $("copy-public-plan-link");
  const logoutBtn = $("admin-logout-btn");

  if (logoBtn) logoBtn.addEventListener("click", uploadLogo);
  if (hpBtn) hpBtn.addEventListener("click", uploadHandlingsplan);
  if (addTemaBtn) addTemaBtn.addEventListener("click", addTema);
  if (saveBtn) saveBtn.addEventListener("click", saveConfig);
  if (collectionToggleBtn) {
    collectionToggleBtn.addEventListener("click", toggleInnspillCollection);
  }
  if (copyFormsLinkBtn) copyFormsLinkBtn.addEventListener("click", copyFormsLink);
  if (copyPublicPageLinkBtn) copyPublicPageLinkBtn.addEventListener("click", copyPublicPageLink);
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (hasUnsavedChanges && !window.confirm("Du har ulagrede endringer. Vil du logge ut likevel?")) return;
      setDirty(false);
      councilToken = "";
      window.HPCouncilSession?.clear(raadId);
      window.location.replace("raad-oversikt.html");
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

  if (!raadId || !window.HPCouncilSession?.get(raadId)) {
    window.HPCouncilSession?.require(raadId);
    return;
  }

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
  if (!await autoLoginFromSession()) return;
  await fetchCouncil();
  initButtons();
});
