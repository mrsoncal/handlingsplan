// handlingsplan/raad.js

const API_BASE = window.HP_API_BASE || "";
const COUNCILS_URL = `${API_BASE}/api/ungdomsrad`;
const INNSPILL_URL = (id) =>
  `${API_BASE}/api/ungdomsrad/${encodeURIComponent(id)}/innspill`;


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

async function fetchInnspill(councilId) {
  const res = await fetch(INNSPILL_URL(councilId));
  if (!res.ok) {
    throw new Error("Kunne ikke hente innspill for dette ungdomsrådet");
  }
  const json = await res.json();
  return Array.isArray(json.items) ? json.items : json;
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

  if (council.has_handlingsplan) {
    const url = `${API_BASE}/api/ungdomsrad/${encodeURIComponent(
      council.id
    )}/handlingsplan-file`;

    link.style.display = "inline-block";
    link.href = url;
    link.target = "_blank";
    link.textContent = "Handlingsplan";
    link.classList.remove("disabled");
    link.setAttribute("aria-disabled", "false");
  } else {
    link.style.display = "none";
  }
}



function updateHeaderBrand(council) {
  if (!council) return;

  const brandImg =
    document.getElementById("raadBrandLogo") ||
    document.querySelector(".header .brand");
  if (!brandImg) return;

  const name = council.display_name || council.name || "Ungdomsråd";

  let logoSrc = "../TU-logov2.png";

  if (council.has_logo) {
    logoSrc = `${API_BASE}/api/ungdomsrad/${encodeURIComponent(
      council.id
    )}/logo-file?cacheBust=${Date.now()}`;
  }

  brandImg.src = logoSrc;
  brandImg.alt = `Logo for ${name}`;
}


// === Admin-overlay for opplasting av handlingsplan ===
function setupAdminOverlay(councilId) {
  const adminBtn = document.getElementById("raadAdminBtn");

  if (!adminBtn) return;

  if (!councilId) {
    adminBtn.disabled = true;
    return;
  }

  adminBtn.addEventListener("click", () => {
    // Redirect to the new admin page
    window.location.href = `raad-admin.html?id=${encodeURIComponent(councilId)}`;
  });
}


// === Innspill-visning: tema-farger & karusell ===

const TEMA_ACCENTS = new Map([
  ["Ungdomsdemokrati og Medvirkning", "#DD1367"],
  ["Samferdsel", "#FF6A18"],
  ["Utdanning og Kompetanse", "#C5182C"],
  ["Folkehelse", "#52A23E"],
  ["Klima og Miljø", "#1C7A23"],
  ["Kultur", "#DD1367"],
]);

let currentSlide = 0;

function applySlideAccent(slideEl, tema) {
  const color = TEMA_ACCENTS.get(tema) || "#888";
  slideEl.style.setProperty("--accent", color);
  slideEl.dataset.tema = tema;
}

function sortAndGroupInnspill(items) {
  const grouped = {};
  for (const it of items) {
    const tema = it.tema || "Uten tema";
    (grouped[tema] ||= []).push(it);
  }

  const temaOrder = [
    "Ungdomsdemokrati og Medvirkning",
    "Samferdsel",
    "Utdanning og Kompetanse",
    "Folkehelse",
    "Klima og Miljø",
    "Kultur",
  ];

  const actionOrder = { add: 0, change: 1, remove: 2 };

  for (const tema in grouped) {
    grouped[tema].sort((a, b) => {
      const nA = a.punkt_nr || 0;
      const nB = b.punkt_nr || 0;
      if (nA !== nB) return nA - nB;
      const oA = actionOrder[a.action_type] ?? 99;
      const oB = actionOrder[b.action_type] ?? 99;
      return oA - oB;
    });
  }

  const sortedGroups = [];
  for (const tema of temaOrder) {
    if (grouped[tema]) sortedGroups.push([tema, grouped[tema]]);
  }
  for (const tema of Object.keys(grouped)) {
    if (!temaOrder.includes(tema)) {
      sortedGroups.push([tema, grouped[tema]]);
    }
  }
  return sortedGroups;
}

function updateCarousel() {
  const track = document.getElementById("carousel-track");
  if (!track) return;
  const total = track.children.length;
  if (!total) return;

  if (currentSlide < 0) currentSlide = 0;
  if (currentSlide > total - 1) currentSlide = total - 1;

  track.style.transform = `translateX(-${currentSlide * 100}%)`;
}

function renderInnspillCarousel(innspill) {
  const container = document.getElementById("raadContent");
  if (!container) return;

  const groups = sortAndGroupInnspill(innspill);

  if (!groups.length) {
    container.innerHTML = `
      <section class="card">
        <h2>Innspill til handlingsplanen</h2>
        <p>Det er ikke registrert noen innspill for dette ungdomsrådet ennå.</p>
      </section>
    `;
    return;
  }

  container.innerHTML = `
    <section class="card">
      <div class="carousel-wrapper">
        <button class="carousel-nav left" id="hpPrevBtn">❮</button>
        <button class="carousel-nav right" id="hpNextBtn">❯</button>
        <div class="carousel">
          <div class="carousel-track" id="carousel-track"></div>
        </div>
      </div>
    </section>
  `;

  const track = document.getElementById("carousel-track");
  const frag = document.createDocumentFragment();

  const actionMap = {
    add: "Legge til punkt",
    change: "Endre punkt",
    remove: "Fjerne punkt",
  };

  groups.forEach(([tema, group]) => {
    const slide = document.createElement("div");
    slide.className = "carousel-slide";
    applySlideAccent(slide, tema);

    const wrapper = document.createElement("div");
    wrapper.className = "table-wrapper";

    const h3 = document.createElement("h3");
    h3.textContent = tema;
    wrapper.appendChild(h3);

    const table = document.createElement("table");
    table.className = "hp-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Hva vil du gjøre?", "Punkt (nr)", "Formuler punktet", "Endre fra", "Endre til"].forEach(
      (label) => {
        const th = document.createElement("th");
        th.textContent = label;
        headRow.appendChild(th);
      }
    );
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    group.forEach((s) => {
      const tr = document.createElement("tr");

      const tdAction = document.createElement("td");
      tdAction.textContent = actionMap[s.action_type] || s.action_type || "";
      tr.appendChild(tdAction);

      const tdPunkt = document.createElement("td");
      tdPunkt.textContent =
        s.underpunkt_nr != null && s.underpunkt_nr !== ""
          ? `${s.punkt_nr}.${s.underpunkt_nr}`
          : s.punkt_nr ?? "";
      tr.appendChild(tdPunkt);

      const tdFormuler = document.createElement("td");
      tdFormuler.textContent = s.formuler_punkt || "";
      tr.appendChild(tdFormuler);

      const tdFra = document.createElement("td");
      tdFra.textContent = s.endre_fra || "";
      tr.appendChild(tdFra);

      const tdTil = document.createElement("td");
      tdTil.textContent = s.endre_til || "";
      tr.appendChild(tdTil);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    slide.appendChild(wrapper);
    frag.appendChild(slide);
  });

  track.replaceChildren(frag);

  currentSlide = 0;
  updateCarousel();

  const prevBtn = document.getElementById("hpPrevBtn");
  const nextBtn = document.getElementById("hpNextBtn");

  if (prevBtn)
    prevBtn.addEventListener("click", () => {
      currentSlide--;
      updateCarousel();
    });
  if (nextBtn)
    nextBtn.addEventListener("click", () => {
      currentSlide++;
      updateCarousel();
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

        updateHeaderBrand(council);

        // Koble Handlingsplan-knappen til opplastet fil (hvis finnes)
        setupHandlingsplanLink(council);

        // Admin-opplasting: etter opplasting oppdatere lenken
        setupAdminOverlay(id, (updatedCouncil) => {
        council = updatedCouncil;
        setupHandlingsplanLink(council);
        });

        // Hent og vis innspill for dette rådet
        const innspill = await fetchInnspill(id);
        renderInnspillCarousel(innspill);
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
