// handlingsplan/raad-admin.js

const API_BASE = window.HP_API_BASE || "";
const raadId = new URLSearchParams(location.search).get("id");

let raadData = null;
let raadPassword = "";
let temaState = [];

// ---------- helpers ----------

function $(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function ensurePassword() {
  if (raadPassword) return true;

  const pwInput = $("raad-password");
  const errorEl = $("raad-login-error");
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
  return true;
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

    const nameInput = $("raad-name-input");
    if (nameInput) nameInput.value = displayName;

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
  });
}

// ---------- logo & handlingsplan ----------

async function uploadLogo() {
  if (!ensurePassword()) return;

  const fileInput = $("raad-logo");
  const statusEl = $("logo-status");

  if (!fileInput || !fileInput.files.length) {
    alert("Velg en logofil først.");
    return;
  }

  if (statusEl) statusEl.textContent = "Laster opp logo…";

  const fd = new FormData();
  fd.append("file", fileInput.files[0]);
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
      if (statusEl) statusEl.textContent = msg;
      alert(msg);
      return;
    }

    raadData = await res.json();
    if (statusEl) statusEl.textContent = "Logo lagret.";
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = "Feil ved opplasting av logo.";
    alert("Det oppstod en feil ved opplasting av logo.");
  }
}

async function uploadHandlingsplan() {
  if (!ensurePassword()) return;

  const fileInput = $("raad-handlingsplan");
  const statusEl = $("hp-status");

  if (!fileInput || !fileInput.files.length) {
    alert("Velg en fil for handlingsplanen først.");
    return;
  }

  if (statusEl) statusEl.textContent = "Laster opp handlingsplan…";

  const fd = new FormData();
  fd.append("file", fileInput.files[0]);
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
      if (statusEl) statusEl.textContent = msg;
      alert(msg);
      return;
    }

    raadData = await res.json();
    if (statusEl) statusEl.textContent = "Handlingsplan lagret.";
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent =
      "Feil ved opplasting av handlingsplan.";
    alert("Det oppstod en feil ved opplasting av handlingsplanen.");
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
    row.className = "form-row";
    row.style.display = "grid";
    row.style.gridTemplateColumns = "2fr auto repeat(3, auto) auto";
    row.style.columnGap = "0.5rem";
    row.style.alignItems = "center";
    row.style.marginBottom = "0.25rem";

    // Navn
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "input";
    nameInput.value = t.name || "";
    nameInput.placeholder = "Tema (f.eks. Skole)";
    nameInput.addEventListener("input", (e) => {
      temaState[index].name = e.target.value;
    });
    row.appendChild(nameInput);

    // Farge
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = t.color || "#0088cc";
    colorInput.addEventListener("input", (e) => {
      temaState[index].color = e.target.value;
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
    row.appendChild(removeLabel);

    // Slett-knapp
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn";
    deleteBtn.textContent = "Slett";
    deleteBtn.style.fontSize = "0.8rem";
    deleteBtn.addEventListener("click", () => {
      if (
        !confirm(
          `Er du sikker på at du vil fjerne temaet "${t.name || ""}"?`
        )
      ) {
        return;
      }
      temaState.splice(index, 1);
      renderTemaList();
    });
    row.appendChild(deleteBtn);

    container.appendChild(row);
  });
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
  renderTemaList();
}

// ---------- lagre navn + tema-oppsett ----------

async function saveConfig() {
  if (!ensurePassword()) return;

  const statusEl = $("save-status");
  const saveBtn = $("save-btn");

  if (statusEl) statusEl.textContent = "Lagrer…";
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
        position:
          typeof t.position === "number" ? t.position : index,
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
      if (statusEl) statusEl.textContent = msg;
      alert(msg);
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

    if (statusEl) statusEl.textContent = "Lagret!";
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent = "Feil ved lagring.";
    alert("Det oppstod en feil ved lagring.");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function updateHeaderBrand(council) {
  if (!council) return;

  const brandImg =
    document.getElementById("raadBrandLogo") ||
    document.querySelector(".header .brand");
  if (!brandImg) return;

  const name = council.display_name || council.name || "Ungdomsråd";

  // Default logo
  let logoSrc = "../TU-logov2.png";

  // If this råd has its own logo, use that (same logic as in raad-oversikt.js)
  if (council.logo_path) {
    logoSrc = `${API_BASE}${council.logo_path}`;
  }

  brandImg.src = logoSrc;
  brandImg.alt = `Logo for ${name}`;
}

// ---------- init ----------

function initButtons() {
  const logoBtn = $("upload-logo-btn");
  const hpBtn = $("upload-hp-btn");
  const addTemaBtn = $("add-tema-btn");
  const saveBtn = $("save-btn");

  if (logoBtn) logoBtn.addEventListener("click", uploadLogo);
  if (hpBtn) hpBtn.addEventListener("click", uploadHandlingsplan);
  if (addTemaBtn) addTemaBtn.addEventListener("click", addTema);
  if (saveBtn) saveBtn.addEventListener("click", saveConfig);
}

updateHeaderBrand(council);

document.addEventListener("DOMContentLoaded", async () => {
  initBackLink();
  await fetchCouncil();
  initLogin();
  initButtons();
});
