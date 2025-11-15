// Base-URL til API-et ditt.
// Hvis du kjører API på samme domenet som statisk side, kan du la denne være tom streng.
const API_BASE = window.HP_API_BASE || ""; // du kan sette window.HP_API_BASE i en liten <script> hvis du vil
const COUNCILS_URL = `${API_BASE}/api/ungdomsrad`;

async function fetchCouncils() {
  const listEl = document.getElementById("councilList");
  const emptyEl = document.getElementById("councilListEmpty");

  try {
    const res = await fetch(COUNCILS_URL);
    if (!res.ok) throw new Error("Kunne ikke hente ungdomsråd");
    const councils = await res.json();

    listEl.innerHTML = "";

    if (!councils || councils.length === 0) {
      if (emptyEl) emptyEl.style.display = "block";
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";

    councils.forEach((council) => {
      const li = document.createElement("li");
      li.className = "council-list-item";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn council-btn";
      btn.textContent = council.display_name || council.name;
      btn.addEventListener("click", () => {
        goToCouncil(council);
      });

      li.appendChild(btn);
      listEl.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    if (emptyEl) {
      emptyEl.style.display = "block";
      emptyEl.textContent = "Feil ved henting av ungdomsråd.";
    }
  }
}

function goToCouncil(council) {
  // Id-basert for nå; senere kan vi bruke slug i URL
  window.location.href = `raad.html?id=${encodeURIComponent(council.id)}`;
}

async function handleNewCouncil(event) {
  event.preventDefault();

  const nameInput = document.getElementById("councilName");
  const yearInput = document.getElementById("councilYear");

  const name = nameInput.value.trim();
  const year = yearInput.value.trim();

  if (!name) {
    alert("Skriv inn et navn på ungdomsrådet.");
    return;
  }

  const payload = { name };
  if (year) payload.year = year;

  try {
    const res = await fetch(COUNCILS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let msg = "Kunne ikke opprette ungdomsråd.";
      try {
        const errorBody = await res.json();
        if (errorBody && errorBody.error) {
          msg += `\n\nDetaljer: ${errorBody.error}`;
        }
      } catch (_) {
        // ignore JSON parse errors
      }
      alert(msg);
      return;
    }

    const created = await res.json();

    // Naviger direkte til den nye siden for dette rådet
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
