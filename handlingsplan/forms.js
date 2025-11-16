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
  const councilId = urlParams.get("raadId") || urlParams.get("councilId") || null;

  const API_BASE = window.HP_API_BASE || "";

  // Juster "Tilbake"-lenken til å peke tilbake til dette rådet
  const backLink = document.getElementById("backLink");
  if (backLink && councilId) {
    backLink.href = `raad.html?id=${encodeURIComponent(councilId)}`;
  }

  function getSelectedAction() {
    const checked = actionRadios.find((r) => r.checked);
    return checked ? checked.value : "";
  }

  function isValidInteger(value, { allowEmpty = false } = {}) {
    if (value === "" || value == null) return allowEmpty;
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
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

      action,
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
