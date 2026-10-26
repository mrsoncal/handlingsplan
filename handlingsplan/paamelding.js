import { enhanceRegistrationSelect } from "./registration-dropdown.js";

const API_BASE = window.HP_API_BASE || "";
const slug = new URLSearchParams(location.search).get("event") || "";
const state = { event: null, types: [], fields: [] };
const $ = (id) => document.getElementById(id);
const fallbackLogo = "../UFR-logo.png";

function notice(message, type = "") {
  $("registration-form-status").textContent = message;
  $("registration-form-status").dataset.type = type;
}

function fieldInputId(field) {
  return `registration-field-${field.id}`;
}

function renderField(field) {
  const label = document.createElement("label");
  label.className = "public-form-question";
  const title = document.createElement("span");
  title.className = "public-question-title";
  title.textContent = field.label;
  if (field.is_required) {
    const required = document.createElement("span");
    required.className = "required-mark";
    required.textContent = " *";
    required.title = "Obligatorisk";
    title.appendChild(required);
  }
  label.appendChild(title);
  if (field.help_text) {
    const help = document.createElement("small");
    help.textContent = field.help_text;
    label.appendChild(help);
  }
  let input;
  if (field.system_key === "participant_type" && field.field_type === "single_choice") {
    input = document.createElement("select");
    input.appendChild(new Option("Velg ett alternativ", ""));
    state.types.forEach((type) => input.appendChild(new Option(type.name, type.id)));
  } else if (field.field_type === "long_text") {
    input = document.createElement("textarea");
    input.rows = 4;
  } else if (field.field_type === "single_choice") {
    input = document.createElement("select");
    input.appendChild(new Option("Velg ett alternativ", ""));
    (field.options || []).forEach((option) => input.appendChild(new Option(option, option)));
  } else {
    input = document.createElement("input");
    if (field.system_key === "email") input.type = "email";
    else if (field.system_key === "phone") input.type = "tel";
    else input.type = "text";
    if (field.system_key === "full_name") input.autocomplete = "name";
    if (field.system_key === "email") input.autocomplete = "email";
    if (field.system_key === "phone") input.autocomplete = "tel";
  }
  input.className = "input";
  input.id = fieldInputId(field);
  if (input instanceof HTMLSelectElement) input.setAttribute("aria-label", field.label);
  input.required = Boolean(field.is_required);
  input.dataset.fieldId = field.id;
  label.htmlFor = input.id;
  label.appendChild(input);
  if (input instanceof HTMLSelectElement) enhanceRegistrationSelect(input);
  return label;
}

function renderFormFields() {
  const container = $("public-form-fields");
  container.innerHTML = "";
  state.fields.forEach((field) => container.appendChild(renderField(field)));
}

async function loadCouncilLogo() {
  let council = state.event.council;
  if (!council?.id) {
    const response = await fetch(`${API_BASE}/api/ungdomsrad`);
    if (!response.ok) return;
    const councils = await response.json();
    const matches = councils.filter((item) => (item.display_name || item.name) === state.event.councilName);
    if (matches.length !== 1) return;
    [council] = matches;
  }
  const logo = $("registration-council-logo");
  logo.alt = `Logo for ${state.event.councilName}`;
  logo.onerror = () => { logo.onerror = null; logo.src = fallbackLogo; };
  logo.src = council.has_logo
    ? `${API_BASE}/api/ungdomsrad/${encodeURIComponent(council.id)}/logo-file?v=${encodeURIComponent(council.logo_version || "current")}`
    : fallbackLogo;
}

async function loadForm() {
  const response = await fetch(`${API_BASE}/api/paamelding/${encodeURIComponent(slug)}`);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Påmeldingen kunne ikke lastes.");
  state.event = result.event;
  state.types = result.types || [];
  state.fields = result.fields || [];
  loadCouncilLogo().catch(() => {});
  document.title = `${state.event.title} – påmelding`;
  $("registration-council").textContent = state.event.councilName;
  $("registration-title").textContent = state.event.title;
  $("registration-description").textContent = state.event.description || "";
  if (!state.event.isOpen) {
    $("registration-closed").hidden = false;
    return;
  }
  renderFormFields();
  $("public-registration-form").hidden = false;
}

async function submitRegistration(event) {
  event.preventDefault();
  const answers = Object.fromEntries(state.fields.map((field) => {
    const input = $(fieldInputId(field));
    return [String(field.id), input?.value?.trim() || ""];
  }));
  const payload = { answers };
  notice("Sender påmelding …");
  const response = await fetch(`${API_BASE}/api/paamelding/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return notice(result.error || "Påmeldingen kunne ikke sendes.", "error");
  $("public-registration-form").hidden = true;
  $("registration-success").hidden = false;
}

$("public-registration-form").addEventListener("submit", submitRegistration);
loadForm().catch((error) => {
  $("registration-title").textContent = "Påmeldingen kunne ikke åpnes";
  $("registration-description").textContent = error.message;
});
