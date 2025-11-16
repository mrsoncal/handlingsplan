// raad-oversikt.js

const API_BASE = window.HP_API_BASE || "";
const COUNCILS_URL = `${API_BASE}/api/ungdomsrad`;

let allCouncils = [];
let addCardEl = null;

// --- AUTH HELPERS ---

function isAdmin() {
  return !!localStorage.getItem("token");
}

function setupAuthUI() {
  const token = localStorage.getItem("token");
  const loginSection = document.getElementById("login-section");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");

  if (!loginSection || !loginButton || !logoutButton) return;

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
  });

  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("token");
    setupAuthUI();
  });

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = document.getElementById("password")?.value;

      try {
        const res = await fetch(`${API_BASE}/api/admin/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });

        if (!res.ok) {
          throw new Error("Feil passord");
        }

        const data = await res.json();
        localStorage.setItem("token", data.token);
        loginSection.style.display = "none";
        setupAuthUI();
      } catch (err) {
        console.error(err);
        alert("Innlogging feilet. Sjekk passordet.");
      }
    });
  }

  const togglePasswordBtn = document.getElementById("togglePassword");
  const passwordInput = document.getElementById("password");
  const togglePasswordIcon = document.getElementById("togglePasswordIcon");

  if (togglePasswordBtn && passwordInput && togglePasswordIcon) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      togglePasswordIcon.src = isPassword ? "hidden.png" : "visible.png";
      togglePasswordIcon.alt = isPassword ? "Skjul passord" : "Vis passord";
    });
  }
}

// --- NAVIGASJON ---

function goToCouncil(council) {
  window.location.href = `raad.html?id=${encodeURIComponent(council.id)}`;
}

// --- DELETE ---

async function deleteCouncil(council) {
  if (!isAdmin()) {
    alert("Du må være logget inn som admin for å slette et ungdomsråd.");
    return;
  }

  const confirmDelete = confirm(
    `Er du sikker på at du vil slette ungdomsrådet "${council.display_name || council.name}"? ` +
      "Denne handlingen kan ikke angres."
  );

  if (!confirmDelete) return;

  const token = localStorage.getItem("token");

  try {
    const res = await fetch(
      `${COUNCILS_URL}/${encodeURIComponent(council.id)}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    );

    if (!res.ok && res.status !== 204) {
      throw new Error("Kunne ikke slette ungdomsråd.");
    }

    await fetchCouncils();
  } catch (err) {
    console.error(err);
    alert("Det oppstod en feil ved sletting av ungdomsråd.");
  }
}

// --- RENDER HJELPER ---

function renderCouncils() {
  const gridEl = document.getElementById("raadGrid");
  const emptyEl = document.getElementById("councilListEmpty");
  const searchInput = document.getElementById("raadSearch");

  if (!gridEl) return;
  if (!addCardEl) {
    addCardEl = gridEl.querySelector(".raad-card-add");
  }

  const term = (searchInput?.value || "").trim().toLowerCase();

  let list = allCouncils;
  if (term) {
    list = allCouncils.filter((c) => {
      const name = (c.display_name || c.name || "").toLowerCase();
      return name.includes(term);
    });
  }

  gridEl.innerHTML = "";
  if (addCardEl) {
    gridEl.appendChild(addCardEl);
  }

  if (!allCouncils.length) {
    if (emptyEl) {
      emptyEl.style.display = "block";
      emptyEl.textContent =
        "Ingen ungdomsråd er opprettet ennå. Bruk kortet «Legg til nytt ungdomsråd» for å opprette ett.";
    }
    return;
  }

  if (!list.length) {
    if (emptyEl) {
      emptyEl.style.display = "block";
      emptyEl.textContent = "Ingen ungdomsråd matcher søket.";
    }
    return;
  }

  if (emptyEl) {
    emptyEl.style.display = "none";
  }

  const admin = isAdmin();

  list.forEach((council) => {
    const card = document.createElement("article");
    card.className = "raad-card";

    const name =
      council.display_name || council.name || `Ungdomsråd #${council.id}`;
    const created = council.created_at
      ? new Date(council.created_at).toLocaleDateString("nb-NO")
      : "";

    // === LEFT DIV: ICON ===
    const iconWrap = document.createElement("div");
    iconWrap.className = "raad-card-icon-wrap";

   const icon = document.createElement("img");

    let logoSrc = "../TU-logov2.png"; // correct relative path from raad-oversikt.html

    if (council.logo_path) {
    // logo_path comes from the backend, e.g. "/uploads/abcd.png"
    logoSrc = `${API_BASE}${council.logo_path}`;
    }

    icon.src = logoSrc;
    icon.alt = `Logo for ${name}`;
    icon.className = "raad-card-icon";


    iconWrap.appendChild(icon);

    // === RIGHT DIV: TITLE + META + ACTIONS ===
    const body = document.createElement("div");
    body.className = "raad-card-body";

    const title = document.createElement("h3");
    title.className = "raad-card-title";
    title.textContent = name;
    body.appendChild(title);

    if (created) {
      const meta = document.createElement("p");
      meta.className = "raad-card-meta";
      meta.textContent = `Opprettet ${created}`;
      body.appendChild(meta);
    }

    const actions = document.createElement("div");
    actions.className = "raad-card-actions";

    if (admin) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn council-delete-btn";
      deleteBtn.textContent = "Slett";
      deleteBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteCouncil(council);
      });
      actions.appendChild(deleteBtn);
    }

    body.appendChild(actions);

    // === Combine into card ===
    card.appendChild(iconWrap);
    card.appendChild(body);

    // Hele kortet er klikkbart
    card.addEventListener("click", () => {
      goToCouncil(council);
    });

    gridEl.appendChild(card);
  });
}


// --- HENT RÅD ---

async function fetchCouncils() {
  const gridEl = document.getElementById("raadGrid");
  const emptyEl = document.getElementById("councilListEmpty");
  if (!gridEl) return;

  try {
    const res = await fetch(COUNCILS_URL);
    if (!res.ok) throw new Error("Kunne ikke hente ungdomsråd.");
    const councils = await res.json();

    allCouncils = Array.isArray(councils) ? councils : [];
    renderCouncils();
  } catch (err) {
    console.error(err);
    if (emptyEl) {
      emptyEl.style.display = "block";
      emptyEl.textContent =
        "Det oppstod en feil ved henting av ungdomsråd. Prøv å laste siden på nytt.";
    }
  }
}

// --- NYTT UNGDOMSRÅD ---

async function handleNewCouncil(event) {
  event.preventDefault();
  const form = event.currentTarget;

  if (form.dataset.submitting === "true") {
    return;
  }
  form.dataset.submitting = "true";

    const nameInput = form.querySelector("#councilName");
    const passwordInput = form.querySelector("#councilPassword");
    const logoFileInput = form.querySelector("#councilLogoFile");

    const name = nameInput?.value.trim();
    const password = passwordInput?.value.trim();
    const logoFile = logoFileInput?.files?.[0] || null;


  if (!name) {
    alert("Skriv inn navn på ungdomsråd.");
    form.dataset.submitting = "false";
    return;
  }

  if (!password) {
    alert("Sett et passord for ungdomsrådet.");
    form.dataset.submitting = "false";
    return;
  }

  try {
    const res = await fetch(COUNCILS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, password }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || "Kunne ikke opprette ungdomsråd.");
    }

    const created = await res.json();

    // Hvis vi har valgt en logo-fil, last den opp som med handlingsplanen
    if (logoFile) {
      try {
        const fd = new FormData();
        fd.append("password", password);
        fd.append("file", logoFile);

        const uploadRes = await fetch(
          `${COUNCILS_URL}/${encodeURIComponent(created.id)}/logo`,
          {
            method: "POST",
            body: fd,
          }
        );

        if (!uploadRes.ok) {
          console.warn("Logo-opplasting feilet, men rådet ble opprettet likevel.");
        }
      } catch (logoErr) {
        console.error("Feil ved opplasting av logo:", logoErr);
      }
    }

    if (nameInput) nameInput.value = "";
    if (passwordInput) passwordInput.value = "";
    if (logoFileInput) logoFileInput.value = "";


    if (nameInput) nameInput.value = "";
    if (passwordInput) passwordInput.value = "";

    // Lukk overlay og gå rett til nytt råd
    const overlay = document.getElementById("newCouncilOverlay");
    if (overlay) {
      overlay.style.display = "none";
    }

    goToCouncil(created);
  } catch (err) {
    console.error(err);
    alert("Det oppstod en feil ved opprettelse av ungdomsråd.");
  } finally {
    form.dataset.submitting = "false";
  }
}

// --- INIT ---

document.addEventListener("DOMContentLoaded", () => {
  setupAuthUI();

  const form = document.getElementById("newCouncilForm");
  if (form) {
    form.addEventListener("submit", handleNewCouncil);
  }

  const searchInput = document.getElementById("raadSearch");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderCouncils();
    });
  }

  const addCard = document.getElementById("raadAddCard");
  const newCouncilOverlay = document.getElementById("newCouncilOverlay");
  const cancelNewCouncilBtn = document.getElementById("cancelNewCouncil");

  if (addCard && newCouncilOverlay) {
    addCard.addEventListener("click", () => {
      newCouncilOverlay.style.display = "flex";
      const nameInput = document.getElementById("councilName");
      if (nameInput) nameInput.focus();
    });
  }

  if (cancelNewCouncilBtn && newCouncilOverlay) {
    cancelNewCouncilBtn.addEventListener("click", () => {
      newCouncilOverlay.style.display = "none";
    });
  }

  // Klikk utenfor boksen lukker overlay
  if (newCouncilOverlay) {
    newCouncilOverlay.addEventListener("click", (event) => {
      const box = newCouncilOverlay.querySelector(".login-box");
      if (box && !box.contains(event.target)) {
        newCouncilOverlay.style.display = "none";
      }
    });
  }

  fetchCouncils();
});
