const createdAt = "2026-08-27T12:00:00.000Z";

let councils = [
  {
    id: 1,
    name: "demo-ungdomsrad",
    display_name: "Demonstrasjon ungdomsråd",
    year: "2026",
    created_at: createdAt,
    admin_password: "demo",
    has_handlingsplan: false,
    has_logo: false,
  },
];

let temaer = [
  { id: 1, council_id: 1, name: "Utdanning og Kompetanse", color: "#2563eb", allowAdd: true, allowChange: true, allowRemove: true, position: 0 },
  { id: 2, council_id: 1, name: "Klima og Miljø", color: "#15803d", allowAdd: true, allowChange: true, allowRemove: true, position: 1 },
  { id: 3, council_id: 1, name: "Kultur", color: "#c2410c", allowAdd: true, allowChange: true, allowRemove: true, position: 2 },
];

let innspill = [
  {
    id: 1,
    council_id: 1,
    created_at: "2026-08-27T12:15:00.000Z",
    action_type: "add",
    tema: "Utdanning og Kompetanse",
    punkt_nr: 1,
    underpunkt_nr: null,
    formuler_punkt: "Alle elever skal ha tilgang til et stille arbeidsrom etter skoletid.",
    endre_fra: null,
    endre_til: null,
    status: "ny",
  },
  {
    id: 2,
    council_id: 1,
    created_at: "2026-08-27T12:30:00.000Z",
    action_type: "change",
    tema: "Klima og Miljø",
    punkt_nr: 2,
    underpunkt_nr: 1,
    formuler_punkt: null,
    endre_fra: "Kommunen bør vurdere flere sykkelstativ.",
    endre_til: "Kommunen skal etablere trygge sykkelparkeringer ved alle skoler.",
    status: "under_behandling",
  },
  {
    id: 3,
    council_id: 1,
    created_at: "2026-08-27T12:45:00.000Z",
    action_type: "remove",
    tema: "Kultur",
    punkt_nr: 3,
    underpunkt_nr: 2,
    formuler_punkt: null,
    endre_fra: "Dagens begrensede åpningstid i ungdomsklubben.",
    endre_til: null,
    status: "godkjent",
  },
];

let nextCouncilId = 2;
let nextTemaId = 4;
let nextInnspillId = 4;
const files = new Map();

function publicCouncil(council) {
  if (!council) return null;
  const { admin_password, ...result } = council;
  return result;
}

async function init() {
  console.log("[db] using temporary in-memory demo data");
}

async function getCouncils() {
  return councils.map(publicCouncil);
}

async function createCouncil({ name, password }) {
  const council = {
    id: nextCouncilId++,
    name: name.trim(),
    display_name: name.trim(),
    year: null,
    created_at: new Date().toISOString(),
    admin_password: password.trim(),
    has_handlingsplan: false,
    has_logo: false,
  };
  councils.push(council);
  return publicCouncil(council);
}

async function getCouncilById(id) {
  return publicCouncil(councils.find((council) => council.id === Number(id)));
}

async function getCouncilWithPassword(id, password) {
  return councils.find(
    (council) => council.id === Number(id) && council.admin_password === password
  ) || null;
}

async function deleteCouncil(id) {
  const councilId = Number(id);
  councils = councils.filter((council) => council.id !== councilId);
  temaer = temaer.filter((tema) => tema.council_id !== councilId);
  innspill = innspill.filter((item) => item.council_id !== councilId);
}

async function createInnspill({ councilId, actionType, tema, punktNr, underpunktNr, nyttPunkt, endreFra, endreTil }) {
  const item = {
    id: nextInnspillId++,
    council_id: Number(councilId),
    created_at: new Date().toISOString(),
    action_type: actionType,
    tema,
    punkt_nr: punktNr,
    underpunkt_nr: underpunktNr || null,
    formuler_punkt: nyttPunkt || null,
    endre_fra: endreFra || null,
    endre_til: endreTil || null,
    status: "ny",
  };
  innspill.push(item);
  return item;
}

async function getInnspillForCouncil(councilId) {
  return innspill.filter((item) => item.council_id === Number(councilId));
}

async function getTemaerForCouncil(councilId) {
  return temaer.filter((tema) => tema.council_id === Number(councilId));
}

async function saveTemaerForCouncil(councilId, values) {
  const id = Number(councilId);
  temaer = temaer.filter((tema) => tema.council_id !== id);
  temaer.push(...values.map((tema) => ({ ...tema, id: nextTemaId++, council_id: id })));
}

async function updateCouncilDisplayName(id, displayName) {
  const council = councils.find((item) => item.id === Number(id));
  if (council) council.display_name = displayName || council.name;
}

async function updateInnspill(councilId, innspillId, changes) {
  const item = innspill.find(
    (value) => value.id === Number(innspillId) && value.council_id === Number(councilId)
  );
  if (!item) return null;
  item.tema = changes.tema || null;
  item.punkt_nr = changes.punktNr || null;
  item.underpunkt_nr = changes.underpunktNr || null;
  item.formuler_punkt = changes.formulerPunkt || null;
  item.endre_fra = changes.endreFra || null;
  item.endre_til = changes.endreTil || null;
  if (changes.status) item.status = changes.status;
  return item;
}

async function deleteInnspill(councilId, innspillId) {
  innspill = innspill.filter(
    (item) => item.id !== Number(innspillId) || item.council_id !== Number(councilId)
  );
}

async function updateFile(id, kind, data, mimeType, originalName) {
  const council = councils.find((item) => item.id === Number(id));
  if (!council) return;
  files.set(`${kind}:${id}`, { data, mimeType, originalName });
  council[kind === "logo" ? "has_logo" : "has_handlingsplan"] = true;
}

const updateCouncilHandlingsplanFile = (id, data, mimeType, originalName) =>
  updateFile(id, "handlingsplan", data, mimeType, originalName);
const updateCouncilLogoFile = (id, data, mimeType, originalName) =>
  updateFile(id, "logo", data, mimeType, originalName);
const getCouncilHandlingsplanFile = async (id) => files.get(`handlingsplan:${id}`) || null;
const getCouncilLogoFile = async (id) => files.get(`logo:${id}`) || null;

module.exports = {
  init,
  getCouncils,
  createCouncil,
  getCouncilById,
  getCouncilWithPassword,
  deleteCouncil,
  createInnspill,
  getInnspillForCouncil,
  getTemaerForCouncil,
  saveTemaerForCouncil,
  updateCouncilDisplayName,
  updateCouncilHandlingsplanFile,
  updateCouncilLogoFile,
  getCouncilHandlingsplanFile,
  getCouncilLogoFile,
  updateInnspill,
  deleteInnspill,
};