const API_BASE = window.HP_API_BASE || "";
const COUNCILS_URL = `${API_BASE}/api/ungdomsrad`;

function getCouncilIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

async function fetchCouncil(id) {
  const res = await fetch(`${COUNCILS_URL}/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Kunne ikke hente ungdomsråd");
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
        "<p>Ingen ungdomsråd er valgt. Gå tilbake og velg et ungdomsråd.</p>";
    }
    return;
  }

  try {
    const council = await fetchCouncil(id);

    if (heading) {
      const name = council.display_name || council.name || "Ukjent ungdomsråd";
      heading.textContent = `Handlingsplan – ${name}`;
    }

    // Beholder resten av siden tom foreløpig – her kan vi senere
    // sette inn tabell-karusell, forms osv. basert på council.id.
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
