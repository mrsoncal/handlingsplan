// handlingsplan/raad-admin.js

const API_BASE = window.HP_API_BASE || "";
const raadId = new URLSearchParams(location.search).get("id");

let raadData = null;
let raadPassword = "";

// ---- Basic helpers ----

function $(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

// ---- Init ----

async function fetchCouncil() {
  if (!raadId) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/ungdomsrad/${encodeURIComponent(raadId)}`
    );
    if (!res.ok) throw new Error("Kunne ikke hente ungdomsråd.");
    raadData = await res.json();

    const name =
      raadData.display_name || raadData.name || "Ukjent ungdomsråd";
    setText("raad-name", name);
  } catch (err) {
    console.error(err);
    alert("Kunne ikke hente data for dette ungdomsrådet.");
  }
}

function getPasswordFromInput() {
  const pwInput = $("raad-password");
  const errorEl = $("raad-login-error");
  const pw = pwInput ? pwInput.value.trim() : "";

  if (!pw) {
    if (errorEl) {
      errorEl.textContent =
        "Skriv inn admin-passordet som ble satt da ungdomsrådet ble opprettet.";
    }
    return null;
  }

  if (errorEl) errorEl.textContent = "";
  return pw;
}

function initLogin() {
  const loginSection = $("login-section");
  const adminSection = $("admin-section");
  const loginBtn = $("raad-login-btn");

  if (!loginBtn) return;

  loginBtn.addEventListener("click", () => {
    const pw = getPasswordFromInput();
    if (!pw) return;

    raadPassword = pw;
    if (loginSection) loginSection.style.display = "none";
    if (adminSection) adminSection.style.display = "block";
  });
}

function ensurePassword() {
  if (raadPassword) return true;

  const pw = getPasswordFromInput();
  if (!pw) return false;

  raadPassword = pw;
  return true;
}

// ---- Upload logo ----

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
      `${API_BASE}/api/ungdomsrad/${encodeURIComponent(
        raadId
      )}/logo`,
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

// ---- Upload handlingsplan ----

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

// ---- Hooks & start-up ----

function initButtons() {
  const logoBtn = $("upload-logo-btn");
  const hpBtn = $("upload-hp-btn");

  if (logoBtn) logoBtn.addEventListener("click", uploadLogo);
  if (hpBtn) hpBtn.addEventListener("click", uploadHandlingsplan);
}

function initBackLink() {
  const backLink = $("back-link");
  if (backLink && raadId) {
    backLink.href = `raad.html?id=${encodeURIComponent(raadId)}`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  initBackLink();
  await fetchCouncil();
  initLogin();
  initButtons();
});
