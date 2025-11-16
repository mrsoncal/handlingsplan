// handlingsplan/raad.js

const API_BASE = window.HP_API_BASE || "";
const COUNCILS_URL = `${API_BASE}/api/ungdomsrad`;

// --- Helpers ---

function getCouncilIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

async function fetchCouncil(id) {
  const res = await fetch(`${COUNCILS_URL}/${encodeURIComponent(id)}`);
  if (!res.ok) {
    throw new Error("Kunne ikke hente ungdomsråd");
  }
  return await res.json();
}

function setupOpenFormsButton(councilId) {
  const btn = document.getElementById("openFormsBtn");
  if (!btn) return;

  if (!councilId) {
    btn.disabled = true;
    btn.textContent = "Ingen ungdomsråd valgt";
    return;
  }

  btn.addEventListener("click", () => {
    window.location.href = `forms.html?raadId=${encodeURIComponent(
      councilId
    )}`;
  });
}

// === Handlingsplan-lenke ===
function setupHandlingsplanLink(council) {
  const link = document.getElementById("handlingsplanLink");
  if (!link) return;

  const path = council.handlingsplan_path;

  if (path) {
    // Dette er den faktiske filen vi lastet opp, f.eks. /uploads/<id>
    const url = `${API_BASE}${path}`;
    link.href = url;
    link.target = "_blank";
    link.textContent = "Handlingsplan";
    link.classList.remove("disabled");
    link.setAttribute("aria-disabled", "false");
  } else {
    // Ingen fil satt ennå → disable og vis tekst
    link.href = "#";
    link.removeAttribute("target");
    link.textContent = "Ingen handlingsplan satt";
    link.classList.add("disabled");
    link.setAttribute("aria-disabled", "true");
    link.addEventListener("click", (e) => e.preventDefault());
  }
}

// === Admin-overlay for opplasting av handlingsplan ===
function setupAdminOverlay(councilId, onUploaded) {
  const adminBtn = document.getElementById("raadAdminBtn");
  const overlay = document.getElementById("raadAdminOverlay");
  const form = document.getElementById("raadAdminForm");
  const passwordInput = document.getElementById("raadAdminPassword");
  const fileInput = document.getElementById("handlingsplanFile");
  const cancelBtn = document.getElementById("raadAdminCancelBtn");

  if (!adminBtn || !overlay || !form || !passwordInput || !fileInput) return;

  if (!councilId) {
    adminBtn.disabled = true;
    return;
  }

  adminBtn.addEventListener("click", () => {
    overlay.style.display = "flex";
  });

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      overlay.style.display = "none";
      form.reset();
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const password = passwordInput.value.trim();
    const file = fileInput.files[0];

    if (!password) {
      alert("Skriv inn passord for dette ungdomsrådet.");
      return;
    }

    if (!file) {
      alert("Velg en fil (PDF eller bilde) før du laster opp.");
      return;
    }

    const formData = new FormData();
    formData.append("password", password);
    formData.append("file", file);

    try {
      const res = await fetch(
        `${COUNCILS_URL}/${encodeURIComponent(councilId)}/handlingsplan`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!res.ok) {
        let msg = "Kunne ikke laste opp handlingsplan.";
        try {
          const data = await res.json();
          if (data && data.error) msg = data.error;
        } catch {
          // ignore JSON parse error
        }
        alert(msg);
        return;
      }

      const updatedCouncil = await res.json();
      alert("Handlingsplan ble oppdatert!");

      overlay.style.display = "none";
      form.reset();

      if (typeof onUploaded === "function") {
        onUploaded(updatedCouncil);
      }
    } catch (err) {
      console.error(err);
      alert("Det oppstod en feil ved opplasting av handlingsplan.");
    }
  });
}

// --- Init ---

async function init() {
  const id = getCouncilIdFromUrl();
  const heading = document.getElementById("councilHeading");
  const container = document.getElementById("raadContent");

  setupOpenFormsButton(id);

  if (!id) {
    if (heading) heading.textContent = "Ingen ungdomsråd valgt";
    if (container) {
      container.innerHTML =
        "<p>Ingen ungdomsråd er valgt. Gå tilbake til oversikten.</p>";
    }
    return;
  }

  try {
    let council = await fetchCouncil(id);

    const title = council.display_name || council.name || "Ukjent ungdomsråd";
    if (heading) heading.textContent = `Handlingsplan – ${title}`;
    document.title = `Handlingsplan – ${title}`;

    if (container) {
      container.innerHTML = `
        <section class="card">
          <h2>${title}</h2>
          <p>Her kommer innholdet for dette ungdomsrådet etter hvert.</p>
          <p><small>ID: ${council.id}</small></p>
        </section>
      `;
    }

    // Koble Handlingsplan-knappen til opplastet fil (hvis finnes)
    setupHandlingsplanLink(council);

    // Admin-opplasting: etter opplasting oppdaterer vi lenken
    setupAdminOverlay(id, (updatedCouncil) => {
      council = updatedCouncil;
      setupHandlingsplanLink(council);
    });
  } catch (err) {
    console.error(err);
    if (heading) heading.textContent = "Feil ved henting av ungdomsråd";

    if (container) {
      container.innerHTML =
        "<p>Det oppstod en feil ved henting av ungdomsrådet. Prøv igjen, eller gå tilbake til oversikten.</p>";
    }
  }
}

document.addEventListener("DOMContentLoaded", init);
