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
  const formTitle = document.getElementById("form-title");
  const formSubtitle = document.getElementById("form-subtitle");
  const formStateMessage = document.getElementById("form-state-message");
  

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
  let isAcceptingInnspill = false;




  // Juster "Tilbake"-lenken til å peke tilbake til dette rådet
  const backLink = document.getElementById("backLink");
  if (backLink && councilId) {
    backLink.href = `raad.html?id=${encodeURIComponent(councilId)}`;
  }
  const breadcrumbCouncilLink = document.getElementById("breadcrumb-council-link");
  if (breadcrumbCouncilLink && councilId) {
    breadcrumbCouncilLink.href = `raad.html?id=${encodeURIComponent(councilId)}`;
  }

  

  temaSelect.innerHTML = '<option value="" selected disabled>Laster temaer…</option>';
  temaSelect.disabled = true;
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
    window.HPBrand?.update(raad, API_BASE);

    const name = raad?.display_name || raad?.name || "Ukjent ungdomsråd";
    const breadcrumbCouncil = document.getElementById("breadcrumb-council");
    if (breadcrumbCouncil) breadcrumbCouncil.textContent = name;
  }

  function showCollectionState(accepting) {
    isAcceptingInnspill = accepting;
    form.hidden = !accepting;
    if (formTitle) formTitle.hidden = !accepting;
    if (formSubtitle) formSubtitle.hidden = !accepting;

    if (formStateMessage) {
      formStateMessage.hidden = accepting;
      formStateMessage.textContent = accepting
        ? ""
        : "Du kan ikke sende inn noen innspill akkurat nå.";
      formStateMessage.dataset.type = accepting ? "" : "info";
    }

    updateVisibilityAndValidity();
  }

  async function refreshCollectionState() {
    if (!councilId) return;

    try {
      const res = await fetch(
        `${API_BASE}/api/ungdomsrad/${encodeURIComponent(councilId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const council = await res.json();
      const accepting = council.accepting_innspill !== false;
      if (accepting !== isAcceptingInnspill) {
        currentCouncil = council;
        if (accepting) populateTemaSelectFromCouncil(council);
        showCollectionState(accepting);
      }
    } catch (err) {
      console.warn("Kunne ikke kontrollere om skjemaet er åpent:", err);
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

      // 2) Vis skjemaet bare når innsamlingen er åpen
      const accepting = council.accepting_innspill !== false;
      if (accepting) {
        populateTemaSelectFromCouncil(council);
        temaSelect.disabled = false;
      }
      showCollectionState(accepting);

      window.HPInnspillSync?.startAutoRefresh(refreshCollectionState, {
        intervalMs: 3000,
      });
    } catch (err) {
      console.error("Feil ved henting av ungdomsråd:", err);
      form.hidden = true;
      if (formTitle) formTitle.hidden = true;
      if (formSubtitle) formSubtitle.hidden = true;
      if (formStateMessage) {
        formStateMessage.hidden = false;
        formStateMessage.textContent =
          "Kunne ikke laste ungdomsrådet. Prøv å laste siden på nytt.";
        formStateMessage.dataset.type = "error";
      }
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

  function updateVisibilityAndValidity() {
    if (!isAcceptingInnspill) {
      submitBtn.disabled = true;
      return;
    }

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
    const statusEl = document.getElementById("form-status");
    const setFormStatus = (message, type = "info") => {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.dataset.type = message ? type : "";
    };

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
      setFormStatus("Kunne ikke koble innspillet til et ungdomsråd. Åpne skjemaet fra rådssiden.", "error");
      return;
    }

    try {
      submitBtn.disabled = true;
      setFormStatus("Sender innspillet…");
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
        const data = await res.json().catch(() => ({}));
        console.error("Feil ved lagring av innspill:", res.status, data);
        if (res.status === 403) {
          showCollectionState(false);
          return;
        }
        setFormStatus("Det oppstod en feil ved innsending. Prøv igjen senere.", "error");
        return;
      }

      const saved = await res.json();
      console.log("[Handlingsplan innspill] lagret:", saved);

      form.reset();
      updateVisibilityAndValidity();
      setFormStatus("Innspillet er sendt inn.", "success");
      window.HPInnspillSync?.notify(councilId);
    } catch (err) {
      console.error("Nettverksfeil ved innsending av innspill:", err);
      setFormStatus("Nettverksfeil. Kontroller tilkoblingen og prøv igjen.", "error");
    }
  });

  updateVisibilityAndValidity();
});
