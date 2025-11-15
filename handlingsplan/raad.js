// handlingsplan/raad.js

const API_BASE = window.HP_API_BASE || "";
const COUNCILS_URL = `${API_BASE}/api/ungdomsrad`;

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

async function init() {
  const id = getCouncilIdFromUrl();
  const heading = document.getElementById("councilHeading");
  const container = document.getElementById("raadContent");

  if (!id) {
    if (heading) heading.textContent = "Ingen ungdomsråd valgt";
    if (container) {
      container.innerHTML =
        '<p>Ingen ungdomsråd er valgt. Gå tilbake til oversikten.</p>';
    }
    return;
  }

  try {
    const council = await fetchCouncil(id);

    // Sett tittel/heading
    const title = council.display_name || council.name;
    if (heading) heading.textContent = `Handlingsplan – ${title}`;
    document.title = `Handlingsplan – ${title}`;

    // Foreløpig holder vi innholdet tomt, men vi kan vise litt basic info:
    if (container) {
      container.innerHTML = `
        <section class="card">
          <h2>${title}</h2>
          <p>Her kommer innholdet for dette ungdomsrådet etter hvert.</p>
          <p><small>ID: ${council.id}${
        council.year ? ` • År/periode: ${council.year}` : ""
      }</small></p>
        </section>
      `;
    }

    // Fremtidig: her kan du montere tabell-karusell, forms osv.
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
