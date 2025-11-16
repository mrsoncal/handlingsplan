// Base-URL til API-et ditt.
// Hvis du kjører API på samme domenet som statisk side, kan du la denne være tom streng.
const API_BASE = window.HP_API_BASE || "";
const COUNCILS_URL = `${API_BASE}/api/ungdomsrad`;

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

  if (loginButton) {
    loginButton.addEventListener("click", () => {
      loginSection.style.display = "flex";
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      localStorage.removeItem("token");
      setupAuthUI();
    });
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = document.getElementById("username")?.value;
      const password = document.getElementById("password")?.value;

      try {
        const res = await fetch(`${API_BASE}/api/admin/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
          throw new Error("Feil brukernavn eller passord");
        }

        const data = await res.json();
        localStorage.setItem("token", data.token);
        loginSection.style.display = "none";
        setupAuthUI();
      } catch (err) {
        console.error(err);
        alert("Innlogging feilet. Sjekk brukernavn og passord.");
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

    // Oppdater liste
    await fetchCouncils();
  } catch (err) {
    console.error(err);
    alert("Det oppstod en feil ved sletting av ungdomsråd.");
  }
}

// --- FETCH & RENDER LISTE ---

async function fetchCouncils() {
  const gridEl = document.getElementById("raadGrid");
  const emptyEl = document.getElementById("councilListEmpty");

  if (!gridEl) return;

  // Behold første kort (legg til råd), fjern øvrige før vi tegner på nytt
  const addCard = gridEl.querySelector(".raad-card-add");

  try {
    const res = await fetch(COUNCILS_URL);
    if (!res.ok) throw new Error("Kunne ikke hente ungdomsråd.");
    const councils = await res.json();

    // Tøm grid og legg tilbake «legg til»-kortet først
    gridEl.innerHTML = "";
    if (addCard) {
      gridEl.appendChild(addCard);
    }

    if (!councils.length) {
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";

    const admin = isAdmin();

    councils.forEach((council) => {
      const card = document.createElement("article");
      card.className = "raad-card";

      const name = council.display_name || council.name || `Ungdomsråd #${council.id}`;
      const created = council.created_at
        ? new Date(council.created_at).toLocaleDateString("nb-NO")
        : "";

      const header = document.createElement("div");
      header.className = "raad-card-header";

      const title = document.createElement("h3");
      title.className = "raad-card-title";
      title.textContent = name;
      header.appendChild(title);

      card.appendChild(header);

      if (created) {
        const meta = document.createElement("p");
        meta.className = "raad-card-meta";
        meta.textContent = `Opprettet ${created}`;
        card.appendChild(meta);
      }

      const actions = document.createElement("div");
      actions.className = "raad-card-actions";

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "btn council-open-btn";
      openBtn.textContent = "Åpne";
      openBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        goToCouncil(council);
      });
      actions.appendChild(openBtn);

      if (admin) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn council-delete-btn";
        deleteBtn.textContent = "Slett";
        deleteBtn.addEventListener("click", (ev) => {
          ev.stopPropagation(); // ikke trigge navigasjon
          deleteCouncil(council);
        });
        actions.appendChild(deleteBtn);
      }

      card.appendChild(actions);

      // Hele kortet er klikkbart for å åpne rådet
      card.addEventListener("click", () => {
        goToCouncil(council);
      });

      gridEl.appendChild(card);
    });
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

  // Prevent double-submit
  if (form.dataset.submitting === "true") {
    console.warn("New council form is already submitting, ignoring.");
    return;
  }
  form.dataset.submitting = "true";

  const nameInput = form.querySelector("#councilName");
  const passwordInput = form.querySelector("#councilPassword");

  const name = nameInput?.value.trim();
  const password = passwordInput?.value.trim();

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

    if (nameInput) nameInput.value = "";
    if (passwordInput) passwordInput.value = "";

    // Gå rett til nytt ungdomsråd
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

  fetchCouncils();
});
