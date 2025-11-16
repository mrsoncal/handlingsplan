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

  loginButton.addEventListener("click", () => {
    loginSection.style.display = "flex";
    loginButton.style.display = "none";
  });

  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("token");
    location.reload();
  });
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

  const name = council.display_name || council.name || "dette ungdomsrådet";
  const confirmed = window.confirm(
    `Er du sikker på at du vil slette "${name}"?\nDette kan ikke angres.`
  );

  if (!confirmed) return;

  try {
    const token = localStorage.getItem("token");

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
  const listEl = document.getElementById("councilList");
  const emptyEl = document.getElementById("councilListEmpty");

  if (!listEl) return;

  try {
    const res = await fetch(COUNCILS_URL);
    if (!res.ok) throw new Error("Kunne ikke hente ungdomsråd.");
    const councils = await res.json();

    listEl.innerHTML = "";

    if (!councils.length) {
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";

    const admin = isAdmin();

    councils.forEach((council) => {
      const li = document.createElement("li");
      li.className = "council-list-item";

      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.className = "btn council-btn";
      nameBtn.textContent = council.display_name || council.name;
      nameBtn.addEventListener("click", () => goToCouncil(council));

      li.appendChild(nameBtn);

      if (admin) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn council-delete-btn";
        deleteBtn.textContent = "Slett";
        deleteBtn.addEventListener("click", (ev) => {
          ev.stopPropagation(); // ikke trigge navigasjon
          deleteCouncil(council);
        });

        li.appendChild(deleteBtn);
      }

      listEl.appendChild(li);
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

  const nameInput = form.querySelector("#councilName");
  const name = nameInput?.value.trim();

  if (!name) {
    alert("Skriv inn navn på ungdomsråd.");
    return;
  }

  try {
    const res = await fetch(COUNCILS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // År/periode sendes ikke lenger – kun navn
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || "Kunne ikke opprette ungdomsråd.");
    }

    const created = await res.json();

    if (nameInput) nameInput.value = "";

    // Gå rett til det nye ungdomsrådet
    goToCouncil(created);
  } catch (err) {
    console.error(err);
    alert("Det oppstod en feil ved opprettelse av ungdomsråd.");
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
