// Handlingsplan: dynamic logic for forms.html
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("hp-form");
  const actionRadios = Array.from(
    document.querySelectorAll('input[name="actionType"]')
  );

  const temaSelect = document.getElementById("tema");
  const punktNrInput = document.getElementById("punktNr");
  const underpunktInput = document.getElementById("underpunktNr");
  const nyttPunktInput = document.getElementById("nyttPunkt");
  const endreFraInput = document.getElementById("endreFra");
  const endreTilInput = document.getElementById("endreTil");
  const sectionAdd = document.getElementById("section-add");
  const sectionChange = document.getElementById("section-change");
  const sectionRemove = document.getElementById("section-remove");
  const submitBtn = document.getElementById("submitBtn");
  

  // --- Koble formen til et spesifikt ungdomsråd --------------------------

  const urlParams = new URLSearchParams(window.location.search);

  // Støtt både ?raadId=, ?councilId= og ?id=
  const councilId =
    urlParams.get("raadId") ||
    urlParams.get("councilId") ||
    urlParams.get("id") ||
    null;

  const API_BASE = window.HP_API_BASE || "";

  // Bruk samme id til å hente råd-info (for logo + tema)
  const raadId = councilId;

  let currentCouncil = null;




  // Juster "Tilbake"-lenken til å peke tilbake til dette rådet
  const backLink = document.getElementById("backLink");
  if (backLink && councilId) {
    backLink.href = `raad.html?id=${encodeURIComponent(councilId)}`;
  }

  

  loadTema();
  fetchCouncilForForm();



  function getSelectedAction() {
    const checked = actionRadios.find((r) => r.checked);
    return checked ? checked.value : "";
  }

  function isValidInteger(value, { allowEmpty = false } = {}) {
    if (value === "" || value == null) return allowEmpty;
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
  }

  function updateHeaderFromCouncil(raad) {
    const name = raad.display_name || raad.name || "Ungdomsråd";

    // Oppdater logo
    const brandImg =
      document.getElementById("raadBrandLogo") ||
      document.querySelector(".brand");
    if (brandImg) {
      if (raad.logo_path) {
        brandImg.src = `${API_BASE}${raad.logo_path}`;
      }
      brandImg.alt = name;
    }

    // Valgfritt: hvis du legger inn <span id="raadName"> i tittelen,
    // kan vi vise navnet her også:
    const nameSpan = document.getElementById("raadName");
    if (nameSpan) {
      nameSpan.textContent = name;
    }
  }


  async function loadTema() {
    if (!councilId) return;

    const res = await fetch(
      `${API_BASE}/api/ungdomsrad/${encodeURIComponent(councilId)}`
    );
    const raad = await res.json();

    // ⬅️ oppdater header-logo + ev. navn
    updateHeaderFromCouncil(raad);

    const temaSelect = document.getElementById("tema");
    temaSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Velg et tema";
    placeholder.disabled = true;
    placeholder.selected = true;
    temaSelect.appendChild(placeholder);

    (raad.temaer || []).forEach((t) => {
      if (!t || !t.name) return;
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = t.name;
      temaSelect.appendChild(opt);
    });

    if (!(raad.temaer || []).length) {
      placeholder.textContent = "Ingen temaer er definert enda";
    }
  }


  async function fetchCouncilForForm() {
    if (!raadId) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/ungdomsrad/${encodeURIComponent(raadId)}`
      );
      if (!res.ok) {
        throw new Error("Kunne ikke hente ungdomsråd.");
      }

      const council = await res.json();
      currentCouncil = council;

      // 1) Oppdater header-logo/tittel (se neste seksjon for header-struktur)
      updateHeaderFromCouncil(council);

      // 2) Fyll ut selectTema fra tema-listen
      populateTemaSelectFromCouncil(council);
    } catch (err) {
      console.error("Feil ved henting av ungdomsråd:", err);
    }
  }

  function populateTemaSelectFromCouncil(council) {
    const select = document.getElementById("tema");
    if (!select) return;

    const temaer = Array.isArray(council.temaer) ? council.temaer : [];

    // Hvis du vil beholde en "Velg tema" default:
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Velg et tema";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    temaer.forEach((t) => {
      if (!t || !t.name) return;

      const option = document.createElement("option");
      option.value = t.name;
      option.textContent = t.name;

      // valgfritt: lagre farge så du kan bruke den i UI-styling
      if (t.color) {
        option.dataset.color = t.color;
      }

      select.appendChild(option);
    });

    // fallback hvis ingen temaer er definert
    if (!temaer.length) {
      placeholder.textContent = "Ingen temaer er definert enda";
    }
  }

  function updateHeaderFromCouncil(council) {
    const name = council.display_name || council.name || "Ungdomsråd";
    const titleSpan = document.getElementById("raad-name");
    if (titleSpan) {
      titleSpan.textContent = name;
    }

    const brandImg = document.querySelector(".brand");
    if (brandImg) {
      if (council.logo_path) {
        // backend returnerer f.eks. "/uploads/xyz"
        brandImg.src = `${API_BASE}${council.logo_path}`;
      }
      brandImg.alt = name;
    }
  }




  function updateVisibilityAndValidity() {
    const action = getSelectedAction();

    // Toggle sections
    sectionAdd.style.display = action === "add" ? "block" : "none";
    sectionChange.style.display = action === "change" ? "block" : "none";
    sectionRemove.style.display = action === "remove" ? "block" : "none";

    // Basic validation
    if (!action) {
      submitBtn.disabled = true;
      return;
    }

    if (!temaSelect.value) {
      submitBtn.disabled = true;
      return;
    }

    const punktVal = punktNrInput.value.trim();
    if (!isValidInteger(punktVal)) {
      submitBtn.disabled = true;
      return;
    }

    // Underpunkt kan være tomt, men hvis fylt må det være gyldig tall
    const underVal = underpunktInput.value.trim();
    if (!isValidInteger(underVal, { allowEmpty: true })) {
      submitBtn.disabled = true;
      return;
    }

    if (action === "add") {
      if (!nyttPunktInput.value.trim()) {
        submitBtn.disabled = true;
        return;
      }
    } else if (action === "change") {
      if (!endreFraInput.value.trim() || !endreTilInput.value.trim()) {
        submitBtn.disabled = true;
        return;
      }
    }

    submitBtn.disabled = false;
  }

  // Attach listeners
  [
    ...actionRadios,
    temaSelect,
    punktNrInput,
    underpunktInput,
    nyttPunktInput,
    endreFraInput,
    endreTilInput,
  ].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", updateVisibilityAndValidity);
    el.addEventListener("change", updateVisibilityAndValidity);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    updateVisibilityAndValidity();
    if (submitBtn.disabled) return;

    const action = getSelectedAction();

    const payload = {
      // NYTT: knytter innspillet til et konkret ungdomsråd
      raadId: councilId,

      actionType: action,
      tema: temaSelect.value || null,
      punktNr: punktNrInput.value ? Number(punktNrInput.value) : null,
      underpunktNr: underpunktInput.value
        ? Number(underpunktInput.value)
        : null,
      nyttPunkt: action === "add" ? nyttPunktInput.value.trim() : null,
      endreFra: action === "change" ? endreFraInput.value.trim() : null,
      endreTil: action === "change" ? endreTilInput.value.trim() : null,
    };

    if (!councilId) {
      alert(
        "Kunne ikke koble innspillet til et ungdomsråd (mangler ?raadId i URLen)."
      );
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/api/ungdomsrad/${encodeURIComponent(
          councilId
        )}/innspill`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Feil ved lagring av innspill:", res.status, text);
        alert(
          "Det oppstod en feil ved innsending av innspillet. Prøv igjen senere."
        );
        return;
      }

      const saved = await res.json();
      console.log("[Handlingsplan innspill] lagret:", saved);

      alert("Innspillet er sendt inn!");
      form.reset();
      updateVisibilityAndValidity();
    } catch (err) {
      console.error("Nettverksfeil ved innsending av innspill:", err);
      alert(
        "Det oppstod en nettverksfeil ved innsending av innspillet. Prøv igjen."
      );
    }


    form.reset();
    updateVisibilityAndValidity();
  });

  updateVisibilityAndValidity();
});
