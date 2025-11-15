// handlingsplan/raad-oversikt.js

// Base-URL til API-et ditt.
// Kan overskrives i HTML via window.HP_API_BASE.
const API_BASE = window.HP_API_BASE || "";
const COUNCILS_URL = `${API_BASE}/api/ungdomsrad`;

// Naviger til individuell side for et ungdomsråd
function goToCouncil(council) {
  // raad.html?id=123
  window.location.href = `raad.html?id=${encodeURIComponent(council.id)}`;
}

async function fetchCouncils() {
  const listEl = document.getElementById("councilList");
  const emptyEl = document.getElementById("councilListEmpty");

  try {
    const res = await fetch(COUNCILS_URL);
    if (!res.ok) throw new Error("Kunne ikke hente ungdomsråd");
    const councils = await res.json();

    listEl.innerHTML = "";

    if (!councils.length) {
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";

    councils.forEach((council) => {
      const li = document.createElement("li");
      li.className = "council-list-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn council-btn";
      button.textContent = council.display_name || council.name;
      button.addEventListener("click", () => goToCouncil(council));

      li.appendChild(button);
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

async function handleNewCouncil(event) {
  event.preventDefault();
  const form = event.currentTarget;

  const nameInput = form.querySelector("#councilName");
  const yearInput = form.querySelector("#councilYear");

  const name = nameInput?.value.trim();
  const year = yearInput?.value.trim() || null;

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
      body: JSON.stringify({ name, year }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || "Kunne ikke opprette ungdomsråd.");
    }

    const created = await res.json();

    // Rensk form og oppdater liste
    if (nameInput) nameInput.value = "";
    if (yearInput) yearInput.value = "";

    // Naviger direkte til nytt ungdomsråd
    goToCouncil(created);
  } catch (err) {
    console.error(err);
    alert("Det oppstod en feil ved opprettelse av ungdomsråd.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("newCouncilForm");
  if (form) {
    form.addEventListener("submit", handleNewCouncil);
  }

  fetchCouncils();
});
