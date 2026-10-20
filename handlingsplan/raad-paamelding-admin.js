import { createClient } from "https://cdn.jsdelivr.net/npm/@insforge/sdk@latest/+esm";

const API_BASE = window.HP_API_BASE || "";
const councilId = Number(new URLSearchParams(location.search).get("id"));
const state = {
  client: null,
  user: null,
  member: null,
  council: null,
  events: [],
  event: null,
  types: [],
  fields: [],
  registrations: [],
  invitations: [],
  email: "",
  canManage: false,
};

const $ = (id) => document.getElementById(id);
const roleLabels = {
  owner: "Eier",
  admin: "Administrator",
  registration_manager: "Påmeldingsansvarlig",
  viewer: "Lesetilgang",
};
const statusLabels = {
  draft: "Kladd",
  open: "Åpen",
  closed: "Stengt",
  archived: "Arkivert",
  submitted: "Ny",
  approved: "Godkjent",
  rejected: "Avvist",
  waitlist: "Venteliste",
  withdrawn: "Trukket",
};

function notice(id, message, type = "") {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  element.dataset.type = type;
}

function errorMessage(error, fallback = "Noe gikk galt. Prøv igjen.") {
  return error?.message || error?.error || fallback;
}

function randomSlug() {
  return crypto.randomUUID().replaceAll("-", "");
}

function publicRegistrationUrl(event = state.event) {
  const url = new URL("paamelding.html", location.href);
  url.search = "";
  url.searchParams.set("event", event.public_slug);
  return url.toString();
}

async function fetchCouncil() {
  const response = await fetch(`${API_BASE}/api/ungdomsrad/${encodeURIComponent(councilId)}`);
  if (!response.ok) throw new Error("Ungdomsrådet kunne ikke lastes.");
  state.council = await response.json();
  $("page-title").textContent = `Påmeldinger for ${state.council.display_name || state.council.name}`;
  $("back-link").href = `raad-admin.html?id=${encodeURIComponent(councilId)}`;
  window.HPBrand?.update(state.council, API_BASE);
}

async function initializeClient() {
  const response = await fetch(`${API_BASE}/api/public-config`);
  const config = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(config.error || "Innlogging er ikke konfigurert.");
  state.client = createClient({ baseUrl: config.baseUrl, anonKey: config.anonKey });
}

async function requestCode() {
  const email = $("auth-email").value.trim().toLowerCase();
  if (!email || !email.includes("@")) return notice("auth-status", "Skriv inn en gyldig e-postadresse.", "error");
  notice("auth-status", "Sender kode …");
  const { error } = await state.client.auth.signInWithOtp({ email });
  if (error) return notice("auth-status", errorMessage(error), "error");
  state.email = email;
  $("email-step").hidden = true;
  $("code-step").hidden = false;
  $("code-help").textContent = `Vi har sendt en kode til ${email}.`;
  $("auth-code").focus();
  notice("auth-status", "");
}

async function verifyCode() {
  const otp = $("auth-code").value.trim();
  if (!otp) return notice("auth-status", "Skriv inn koden fra e-posten.", "error");
  notice("auth-status", "Logger inn …");
  const { data, error } = await state.client.auth.verifyOtp({ email: state.email, otp });
  if (error) return notice("auth-status", errorMessage(error), "error");
  state.user = data?.user || data;
  await afterLogin();
}

async function restoreSession() {
  const { data, error } = await state.client.auth.getCurrentUser();
  if (!error && data?.user) state.user = data.user;
  else if (!error && data?.id) state.user = data;
  if (state.user) await afterLogin();
}

async function afterLogin() {
  $("sign-out-btn").hidden = false;
  const { error: claimError } = await state.client.database.rpc("claim_council_invitations");
  if (claimError) console.warn("Could not claim invitations", claimError);
  const { data, error } = await state.client.database.from("council_members")
    .select("id,council_id,user_id,role,created_at")
    .eq("council_id", councilId)
    .eq("user_id", state.user.id)
    .maybeSingle();
  if (error) return notice("auth-status", errorMessage(error), "error");
  state.member = data || null;
  $("auth-panel").hidden = true;
  if (!state.member) {
    $("bootstrap-panel").hidden = false;
    return;
  }
  await openAdminApp();
}

async function bootstrapOwner() {
  const password = $("bootstrap-password").value;
  if (!password) return notice("bootstrap-status", "Skriv inn rådets passord.", "error");
  const response = await fetch(`${API_BASE}/api/ungdomsrad/${encodeURIComponent(councilId)}/registration-bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, userId: state.user.id }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return notice("bootstrap-status", result.error || "Tilgangen kunne ikke aktiveres.", "error");
  state.member = result.member;
  $("bootstrap-panel").hidden = true;
  await openAdminApp();
}

async function openAdminApp() {
  $("admin-app").hidden = false;
  $("current-user-label").textContent = state.user.email || "Innlogget bruker";
  $("current-role-label").textContent = roleLabels[state.member.role] || state.member.role;
  const canManage = ["owner", "admin", "registration_manager"].includes(state.member.role);
  state.canManage = canManage;
  $("new-event-btn").hidden = !canManage;
  if (!canManage) $("new-event-panel").hidden = true;
  $("member-panel").hidden = !["owner", "admin"].includes(state.member.role);
  ["save-event-btn", "question-add-bar"].forEach((id) => {
    const element = $(id);
    if (element) element.hidden = !canManage;
  });
  await loadEvents();
  if (["owner", "admin"].includes(state.member.role)) await loadInvitations();
}

async function signOut() {
  await state.client.auth.signOut();
  location.reload();
}

async function loadEvents(selectId = state.event?.id) {
  const { data, error } = await state.client.database.from("registration_events")
    .select("id,council_id,title,public_slug,status,description,starts_at,closes_at,created_at")
    .eq("council_id", councilId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return notice("event-status-message", errorMessage(error), "error");
  state.events = data || [];
  renderEventList();
  const next = state.events.find((item) => item.id === selectId) || state.events[0];
  if (next) await selectEvent(next.id);
}

function renderEventList() {
  const list = $("event-list");
  list.innerHTML = "";
  if (!state.events.length) {
    list.innerHTML = "<p>Ingen arrangementer ennå.</p>";
    return;
  }
  state.events.forEach((event) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.eventId = event.id;
    button.setAttribute("aria-current", String(event.id === state.event?.id));
    const title = document.createElement("strong");
    title.textContent = event.title;
    const status = document.createElement("small");
    status.textContent = statusLabels[event.status] || event.status;
    button.append(title, status);
    button.addEventListener("click", () => selectEvent(event.id));
    list.appendChild(button);
  });
}

function showNewEventForm() {
  $("new-event-panel").hidden = false;
  notice("new-event-status", "");
  $("new-event-title").focus();
  $("new-event-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideNewEventForm() {
  $("new-event-form").reset();
  notice("new-event-status", "");
  $("new-event-panel").hidden = true;
  $("new-event-btn").focus();
}

async function createEvent(submitEvent) {
  submitEvent.preventDefault();
  const title = $("new-event-title").value.trim();
  const description = $("new-event-description").value.trim();
  if (!title) {
    notice("new-event-status", "Skriv inn et navn på arrangementet.", "error");
    return;
  }

  const button = $("create-event-btn");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Oppretter …";
  notice("new-event-status", "Oppretter arrangementet …");
  const { data, error } = await state.client.database.from("registration_events").insert([{
    council_id: councilId,
    title,
    public_slug: randomSlug(),
    status: "draft",
    description: description || null,
    created_by: state.user.id,
  }]).select("id,council_id,title,public_slug,status,description,starts_at,closes_at,created_at").single();
  if (error) {
    notice("new-event-status", errorMessage(error), "error");
    button.disabled = false;
    button.textContent = originalLabel;
    return;
  }
  const defaults = [
    { event_id: data.id, name: "Ungdomsråd", affiliation_prompt: "Hvilket ungdomsråd representerer du?", display_template: "{tilhorighet} ungdomsråd", position: 0 },
    { event_id: data.id, name: "VGS", affiliation_prompt: "Hvilken videregående skole representerer du?", display_template: "{tilhorighet} VGS", position: 1 },
    { event_id: data.id, name: "Ekstern", affiliation_prompt: "Hvilken organisasjon representerer du?", display_template: "{tilhorighet}", position: 2 },
  ];
  const typeResult = await state.client.database.from("registration_types").insert(defaults);
  if (typeResult.error) console.warn("Could not create default registration types", typeResult.error);
  const fieldResult = await state.client.database.from("registration_form_fields").insert([
    { event_id: data.id, label: "Fullt navn", field_type: "short_text", system_key: "full_name", is_required: true, position: 0 },
    { event_id: data.id, label: "E-postadresse", field_type: "short_text", system_key: "email", is_required: false, position: 1 },
    { event_id: data.id, label: "Telefonnummer", field_type: "short_text", system_key: "phone", is_required: false, position: 2 },
    { event_id: data.id, label: "Hvordan deltar du?", field_type: "single_choice", system_key: "participant_type", is_required: true, position: 3 },
    { event_id: data.id, label: "Hvem representerer du?", field_type: "short_text", system_key: "affiliation", is_required: true, position: 4 },
  ]);
  if (fieldResult.error) console.warn("Could not create default form fields", fieldResult.error);
  $("new-event-form").reset();
  $("new-event-panel").hidden = true;
  button.disabled = false;
  button.textContent = originalLabel;
  await loadEvents(data.id);
  notice("event-status-message", "Arrangementet er opprettet som kladd.", "success");
}

async function selectEvent(eventId) {
  state.event = state.events.find((event) => event.id === Number(eventId));
  if (!state.event) return;
  $("empty-event-state").hidden = true;
  $("event-editor").hidden = false;
  $("event-title").value = state.event.title || "";
  $("event-description").value = state.event.description || "";
  $("event-status").value = state.event.status;
  $("event-status-badge").textContent = statusLabels[state.event.status] || state.event.status;
  const shareUrl = publicRegistrationUrl();
  $("open-registration-link").href = shareUrl;
  $("preview-registration-link").href = shareUrl;
  renderEventList();
  await loadTypes();
  await Promise.all([loadFields(), loadRegistrations()]);
}

async function saveEvent() {
  const changes = {
    title: $("event-title").value.trim(),
    description: $("event-description").value.trim() || null,
    status: $("event-status").value,
  };
  if (!changes.title) return notice("event-status-message", "Arrangementet må ha et navn.", "error");
  const { data, error } = await state.client.database.from("registration_events")
    .update(changes).eq("id", state.event.id).select("id,council_id,title,public_slug,status,description,starts_at,closes_at,created_at").single();
  if (error) return notice("event-status-message", errorMessage(error), "error");
  state.event = data;
  notice("event-status-message", "Arrangementet er lagret.", "success");
  await loadEvents(data.id);
}

async function copyRegistrationLink() {
  await navigator.clipboard.writeText(publicRegistrationUrl());
  notice("event-status-message", "Påmeldingslenken er kopiert.", "success");
}

async function loadTypes() {
  const { data, error } = await state.client.database.from("registration_types")
    .select("id,event_id,name,affiliation_prompt,display_template,requires_affiliation,can_receive_delegate_number,position")
    .eq("event_id", state.event.id).order("position", { ascending: true }).limit(100);
  if (error) return notice("event-status-message", errorMessage(error), "error");
  state.types = data || [];
}

const fieldTypeLabels = {
  short_text: "Kort svar",
  long_text: "Langt svar",
  single_choice: "Flervalg",
};

async function loadFields() {
  const { data, error } = await state.client.database.from("registration_form_fields")
    .select("id,event_id,label,field_type,help_text,is_required,position,system_key,options")
    .eq("event_id", state.event.id).order("position", { ascending: true }).limit(200);
  if (error) return notice("builder-status-message", errorMessage(error), "error");
  state.fields = data || [];
  renderFormBuilder();
}

function questionIcon(field) {
  if (field.system_key === "participant_type") return "●";
  if (field.field_type === "long_text") return "≡";
  if (field.field_type === "single_choice") return "●";
  return "—";
}

function renderFormBuilder() {
  const list = $("form-builder-list");
  list.innerHTML = "";
  if (!state.fields.length) {
    list.innerHTML = '<div class="builder-empty"><strong>Skjemaet har ingen spørsmål ennå.</strong><p>Legg til et spørsmål under.</p></div>';
    return;
  }
  state.fields.forEach((field, index) => list.appendChild(buildQuestionCard(field, index)));
}

function buildQuestionCard(field, index) {
  const card = document.createElement("article");
  card.className = "question-card";
  card.dataset.fieldId = field.id;

  const top = document.createElement("div");
  top.className = "question-card-top";
  const icon = document.createElement("span");
  icon.className = "question-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = questionIcon(field);
  const label = document.createElement("input");
  label.className = "question-title-input";
  label.value = field.label;
  label.setAttribute("aria-label", "Spørsmålstekst");
  label.disabled = !state.canManage;
  label.addEventListener("change", () => updateField(field.id, { label: label.value.trim() || field.label }));
  const type = document.createElement("select");
  type.className = "question-type-select";
  type.setAttribute("aria-label", "Svartype");
  Object.entries(fieldTypeLabels).forEach(([value, text]) => type.add(new Option(text, value)));
  type.value = field.field_type;
  type.disabled = !state.canManage || Boolean(field.system_key);
  type.addEventListener("change", () => updateField(field.id, { field_type: type.value }));
  top.append(icon, label, type);

  const preview = document.createElement("div");
  preview.className = "question-preview";
  if (field.system_key === "participant_type") {
    preview.appendChild(buildParticipantOptions());
  } else if (field.field_type === "single_choice") {
    preview.appendChild(buildCustomOptions(field));
  } else {
    const line = document.createElement(field.field_type === "long_text" ? "textarea" : "input");
    line.className = "question-preview-input";
    line.placeholder = field.field_type === "long_text" ? "Deltakeren skriver et lengre svar" : "Deltakeren skriver svaret sitt";
    line.disabled = true;
    preview.appendChild(line);
  }

  const footer = document.createElement("div");
  footer.className = "question-card-footer";
  const moveGroup = document.createElement("div");
  moveGroup.className = "question-move-actions";
  const up = iconButton("↑", "Flytt spørsmålet opp", () => moveField(index, -1));
  const down = iconButton("↓", "Flytt spørsmålet ned", () => moveField(index, 1));
  up.disabled = !state.canManage || index === 0;
  down.disabled = !state.canManage || index === state.fields.length - 1;
  moveGroup.append(up, down);
  const right = document.createElement("div");
  right.className = "question-footer-actions";
  const requiredLabel = document.createElement("label");
  requiredLabel.className = "builder-required-toggle";
  const required = document.createElement("input");
  required.type = "checkbox";
  required.checked = field.is_required;
  required.disabled = !state.canManage || field.system_key === "full_name" || field.system_key === "participant_type";
  required.addEventListener("change", () => updateField(field.id, { is_required: required.checked }));
  requiredLabel.append(required, document.createTextNode(" Obligatorisk"));
  right.appendChild(requiredLabel);
  if (!field.system_key && state.canManage) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "question-delete-button";
    remove.textContent = "Fjern";
    remove.addEventListener("click", () => armDelete(remove, () => deleteField(field.id)));
    right.appendChild(remove);
  }
  footer.append(moveGroup, right);
  card.append(top, preview, footer);
  return card;
}

function iconButton(text, label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "question-icon-button";
  button.textContent = text;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", handler);
  return button;
}

function armDelete(button, action) {
  if (button.dataset.armed === "true") return action();
  button.dataset.armed = "true";
  button.textContent = "Trykk igjen for å fjerne";
  setTimeout(() => {
    button.dataset.armed = "false";
    button.textContent = "Fjern";
  }, 3500);
}

function buildParticipantOptions() {
  const wrapper = document.createElement("div");
  wrapper.className = "builder-options";
  state.types.forEach((item) => {
    const row = document.createElement("div");
    row.className = "builder-option-row";
    const dot = document.createElement("span");
    dot.className = "option-dot";
    const input = document.createElement("input");
    input.className = "option-input";
    input.value = item.name;
    input.disabled = !state.canManage;
    input.addEventListener("change", () => updateParticipantType(item.id, input.value));
    row.append(dot, input);
    if (state.canManage) {
      const remove = iconButton("×", `Fjern ${item.name}`, () => armDelete(remove, () => deleteParticipantType(item.id)));
      remove.classList.add("option-remove-button");
      row.appendChild(remove);
    }
    wrapper.appendChild(row);
  });
  if (state.canManage) {
    const addRow = document.createElement("div");
    addRow.className = "builder-option-row add-option-row";
    const addInput = document.createElement("input");
    addInput.className = "option-input";
    addInput.placeholder = "Legg til et alternativ";
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "add-option-button";
    addButton.textContent = "Legg til";
    addButton.addEventListener("click", () => addParticipantType(addInput.value));
    addInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); addParticipantType(addInput.value); }
    });
    addRow.append(addInput, addButton);
    wrapper.appendChild(addRow);
  }
  return wrapper;
}

function buildCustomOptions(field) {
  const wrapper = document.createElement("div");
  wrapper.className = "builder-options";
  const options = Array.isArray(field.options) ? field.options : [];
  options.forEach((value, optionIndex) => {
    const row = document.createElement("div");
    row.className = "builder-option-row";
    const dot = document.createElement("span");
    dot.className = "option-dot";
    const input = document.createElement("input");
    input.className = "option-input";
    input.value = value;
    input.disabled = !state.canManage;
    input.addEventListener("change", () => {
      const next = [...options]; next[optionIndex] = input.value.trim() || value;
      updateField(field.id, { options: next });
    });
    row.append(dot, input);
    if (state.canManage) {
      const remove = iconButton("×", `Fjern ${value}`, () => {
        const next = options.filter((_, index) => index !== optionIndex);
        updateField(field.id, { options: next });
      });
      remove.classList.add("option-remove-button");
      row.appendChild(remove);
    }
    wrapper.appendChild(row);
  });
  if (state.canManage) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "inline-add-option";
    add.textContent = "+ Legg til alternativ";
    add.addEventListener("click", () => updateField(field.id, { options: [...options, `Alternativ ${options.length + 1}`] }));
    wrapper.appendChild(add);
  }
  return wrapper;
}

async function updateField(id, changes) {
  notice("builder-status-message", "Lagrer …");
  const { error } = await state.client.database.from("registration_form_fields").update(changes).eq("id", id);
  if (error) return notice("builder-status-message", errorMessage(error), "error");
  notice("builder-status-message", "Lagret", "success");
  await loadFields();
}

async function addField(fieldType) {
  const defaults = {
    short_text: { label: "Nytt spørsmål", options: [] },
    long_text: { label: "Nytt spørsmål", options: [] },
    single_choice: { label: "Velg ett alternativ", options: ["Alternativ 1", "Alternativ 2"] },
  };
  const item = defaults[fieldType] || defaults.short_text;
  const { error } = await state.client.database.from("registration_form_fields").insert([{
    event_id: state.event.id,
    label: item.label,
    field_type: fieldType,
    is_required: false,
    position: state.fields.length,
    options: item.options,
  }]);
  if (error) return notice("builder-status-message", errorMessage(error), "error");
  await loadFields();
  $("form-builder-list").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteField(id) {
  const { error } = await state.client.database.from("registration_form_fields").delete().eq("id", id);
  if (error) return notice("builder-status-message", errorMessage(error), "error");
  await loadFields();
}

async function moveField(index, direction) {
  const otherIndex = index + direction;
  if (otherIndex < 0 || otherIndex >= state.fields.length) return;
  const current = state.fields[index];
  const other = state.fields[otherIndex];
  const [first, second] = await Promise.all([
    state.client.database.from("registration_form_fields").update({ position: other.position }).eq("id", current.id),
    state.client.database.from("registration_form_fields").update({ position: current.position }).eq("id", other.id),
  ]);
  if (first.error || second.error) return notice("builder-status-message", errorMessage(first.error || second.error), "error");
  await loadFields();
}

async function updateParticipantType(id, name) {
  const nextName = name.trim();
  if (!nextName) return renderFormBuilder();
  const { error } = await state.client.database.from("registration_types").update({ name: nextName }).eq("id", id);
  if (error) return notice("builder-status-message", errorMessage(error), "error");
  await loadTypes();
  renderFormBuilder();
  notice("builder-status-message", "Lagret", "success");
}

async function addParticipantType(name) {
  const cleanName = name.trim();
  if (!cleanName) return;
  const { error } = await state.client.database.from("registration_types").insert([{
    event_id: state.event.id,
    name: cleanName,
    affiliation_prompt: "Hvem representerer du?",
    display_template: "{tilhorighet} {type}",
    requires_affiliation: true,
    can_receive_delegate_number: true,
    position: state.types.length,
  }]);
  if (error) return notice("builder-status-message", errorMessage(error), "error");
  await loadTypes();
  renderFormBuilder();
}

async function deleteParticipantType(id) {
  if (state.types.length <= 1) return notice("builder-status-message", "Skjemaet må ha minst ett alternativ for hvordan man deltar.", "error");
  const { error } = await state.client.database.from("registration_types").delete().eq("id", id);
  if (error) return notice("builder-status-message", "Alternativet brukes av en påmelding og kan derfor ikke fjernes.", "error");
  await loadTypes();
  renderFormBuilder();
}

async function loadRegistrations() {
  const { data, error } = await state.client.database.from("registrations")
    .select("id,event_id,type_id,full_name,email,phone,affiliation,delegate_number,status,notes,created_at")
    .eq("event_id", state.event.id).order("created_at", { ascending: true }).limit(2000);
  if (error) return notice("registration-status-message", errorMessage(error), "error");
  state.registrations = data || [];
  renderRegistrations();
}

function renderRegistrations() {
  const rows = state.registrations;
  $("registration-count").textContent = rows.length === 1 ? "1 person er påmeldt" : `${rows.length} personer er påmeldt`;
  const body = $("registration-rows");
  body.innerHTML = "";
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-table-cell">Ingen har meldt seg på ennå.</td></tr>';
    return;
  }
  rows.forEach((registration) => {
    const type = state.types.find((item) => item.id === registration.type_id);
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.innerHTML = `<strong></strong>`;
    nameCell.querySelector("strong").textContent = registration.full_name;
    const contactCell = document.createElement("td");
    contactCell.innerHTML = `<span></span><small></small>`;
    contactCell.querySelector("span").textContent = registration.email || "–";
    contactCell.querySelector("small").textContent = registration.phone || "";
    const typeCell = document.createElement("td"); typeCell.textContent = type?.name || "–";
    const affiliationCell = document.createElement("td"); affiliationCell.textContent = registration.affiliation || "–";
    const dateCell = document.createElement("td");
    dateCell.textContent = new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(registration.created_at));
    row.append(nameCell, contactCell, typeCell, affiliationCell, dateCell);
    body.appendChild(row);
  });
}

async function updateRegistration(id, changes, reload = true) {
  const { error } = await state.client.database.from("registrations").update(changes).eq("id", id);
  if (error) return notice("registration-status-message", errorMessage(error), "error");
  if (reload) await loadRegistrations();
}

async function assignMissingNumbers() {
  let next = Math.max(0, ...state.registrations.map((item) => Number(item.delegate_number) || 0)) + 1;
  const candidates = state.registrations.filter((item) => {
    const type = state.types.find((value) => value.id === item.type_id);
    return !item.delegate_number && type?.can_receive_delegate_number;
  });
  for (const participant of candidates) {
    await updateRegistration(participant.id, { delegate_number: next++ }, false);
  }
  await loadRegistrations();
  notice("registration-status-message", candidates.length ? `${candidates.length} delegatnumre ble tildelt.` : "Ingen manglende delegatnumre.", "success");
}

function talestolenOrganization(registration) {
  const type = state.types.find((item) => item.id === registration.type_id);
  const template = type?.display_template || "{tilhorighet}";
  return template
    .replaceAll("{tilhorighet}", registration.affiliation || "")
    .replaceAll("{type}", type?.name || "")
    .replace(/\s+/g, " ")
    .trim();
}

async function sendToTalestolen() {
  if (!state.registrations.length) return notice("registration-status-message", "Det er ingen påmeldte å sende til Talestolen ennå.", "error");
  await assignMissingNumbers();
  const participants = state.registrations.filter((item) => item.delegate_number);
  if (!participants.length) return notice("registration-status-message", "Ingen av de påmeldte kan få delegatnummer.", "error");
  const delegates = Object.fromEntries(participants.map((item) => {
    const number = String(item.delegate_number);
    return [number, { number, name: item.full_name, org: talestolenOrganization(item) }];
  }));
  const snapshotKey = "talestolen_state_v2";
  let snapshot = {};
  try { snapshot = JSON.parse(localStorage.getItem(snapshotKey) || "{}"); } catch { snapshot = {}; }
  snapshot = {
    queue: [],
    currentSpeaker: null,
    typeDurations: { innlegg: 90, replikk: 60, svar_replikk: 60 },
    ...snapshot,
    delegates,
    version: Number(snapshot.version || 0) + 1,
    updatedAt: Date.now(),
  };
  localStorage.setItem(snapshotKey, JSON.stringify(snapshot));
  const escapeCsv = (value) => `"${String(value || "").replaceAll('"', '""')}"`;
  const csv = ["delegatnummer;fullt navn;representerer", ...participants.map((item) => [
    item.delegate_number, item.full_name, talestolenOrganization(item),
  ].map(escapeCsv).join(";"))].join("\n");
  localStorage.setItem("talestolen_delegates_csv_raw", csv);
  location.href = "../talestolen/";
}

async function loadInvitations() {
  const { data, error } = await state.client.database.from("council_invitations")
    .select("id,email,role,accepted_at,created_at")
    .eq("council_id", councilId).order("created_at", { ascending: false }).limit(200);
  if (error) return notice("invite-status", errorMessage(error), "error");
  state.invitations = data || [];
  const list = $("invite-list");
  list.innerHTML = "";
  state.invitations.forEach((invitation) => {
    const item = document.createElement("div");
    item.className = "invite-item";
    item.textContent = `${invitation.email} · ${roleLabels[invitation.role] || invitation.role} · ${invitation.accepted_at ? "Aktivert" : "Venter"}`;
    list.appendChild(item);
  });
}

async function inviteMember(event) {
  event.preventDefault();
  const email = $("invite-email").value.trim().toLowerCase();
  const role = $("invite-role").value;
  const { error } = await state.client.database.from("council_invitations").insert([{
    council_id: councilId, email, role, invited_by: state.user.id,
  }]);
  if (error) return notice("invite-status", errorMessage(error), "error");
  event.target.reset();
  notice("invite-status", "Invitasjonen er registrert. Be personen logge inn med samme e-postadresse.", "success");
  await loadInvitations();
}

function bindEvents() {
  $("send-code-btn").addEventListener("click", requestCode);
  $("verify-code-btn").addEventListener("click", verifyCode);
  $("bootstrap-btn").addEventListener("click", bootstrapOwner);
  $("sign-out-btn").addEventListener("click", signOut);
  $("new-event-btn").addEventListener("click", showNewEventForm);
  $("cancel-new-event-btn").addEventListener("click", hideNewEventForm);
  $("new-event-form").addEventListener("submit", createEvent);
  $("save-event-btn").addEventListener("click", saveEvent);
  $("copy-registration-link-btn").addEventListener("click", copyRegistrationLink);
  document.querySelectorAll("[data-field-type]").forEach((button) => {
    button.addEventListener("click", () => addField(button.dataset.fieldType));
  });
  $("send-to-talestolen-btn").addEventListener("click", sendToTalestolen);
  $("invite-form").addEventListener("submit", inviteMember);
}

async function init() {
  if (!Number.isInteger(councilId) || councilId < 1) {
    $("auth-panel").innerHTML = "<p>Ugyldig ungdomsråd.</p>";
    return;
  }
  bindEvents();
  try {
    await Promise.all([fetchCouncil(), initializeClient()]);
    await restoreSession();
  } catch (error) {
    notice("auth-status", errorMessage(error), "error");
  }
}

init();
