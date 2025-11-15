// Handlingsplan: dynamic logic for forms.html
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("hp-form");
  const actionRadios = Array.from(document.querySelectorAll('input[name="actionType"]'));
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

  function getSelectedAction() {
    const checked = actionRadios.find(r => r.checked);
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

    if (!isValidInteger(punktNrInput.value)) {
      submitBtn.disabled = true;
      return;
    }

    if (!isValidInteger(underpunktInput.value, { allowEmpty: true })) {
      submitBtn.disabled = true;
      return;
    }

    if (action === "add") {
      if (!nyttPunktInput.value.trim()) {
        submitBtn.disabled = true;
        return;
      }
    }

    if (action === "change") {
      if (!endreFraInput.value.trim() || !endreTilInput.value.trim()) {
        submitBtn.disabled = true;
        return;
      }
    }

    submitBtn.disabled = false;
  }

  // Attach listeners
  [...actionRadios,
   temaSelect,
   punktNrInput,
   underpunktInput,
   nyttPunktInput,
   endreFraInput,
   endreTilInput].forEach(el => {
    if (!el) return;
    el.addEventListener("input", updateVisibilityAndValidity);
    el.addEventListener("change", updateVisibilityAndValidity);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    updateVisibilityAndValidity();
    if (submitBtn.disabled) return;

    const action = getSelectedAction();

    const payload = {
      action,
      tema: temaSelect.value || null,
      punktNr: punktNrInput.value ? Number(punktNrInput.value) : null,
      underpunktNr: underpunktInput.value ? Number(underpunktInput.value) : null,
      nyttPunkt: action === "add" ? nyttPunktInput.value.trim() : null,
      endreFra: action === "change" ? endreFraInput.value.trim() : null,
      endreTil: action === "change" ? endreTilInput.value.trim() : null,
    };

    console.log("[Handlingsplan innspill] payload:", payload);
    alert("Innspill sendt! (demo)\n\nDenne siden kan senere kobles direkte til backend.");

    form.reset();
    updateVisibilityAndValidity();
  });

  updateVisibilityAndValidity();
});
