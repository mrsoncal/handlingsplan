const API_BASE = "https://qeb2527k.function2.insforge.app/handlingsplan-api";
const SESSION_PREFIX = "hp_council_session_v1:";

export function getCouncilId() {
  const value = Number(new URLSearchParams(window.location.search).get("id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function getCouncilSession(councilId = getCouncilId()) {
  if (!councilId) return null;
  const key = `${SESSION_PREFIX}${councilId}`;
  try {
    const session = JSON.parse(localStorage.getItem(key) || "null");
    if (!session?.token || Number(session.expiresAt) <= Date.now()) {
      localStorage.removeItem(key);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function clearCouncilSession(councilId = getCouncilId()) {
  if (councilId) localStorage.removeItem(`${SESSION_PREFIX}${councilId}`);
}

function headers(councilId, json = false) {
  const session = getCouncilSession(councilId);
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(session?.token ? { "X-Council-Session": session.token } : {}),
  };
}

async function request(councilId, path, options = {}) {
  const response = await fetch(`${API_BASE}/api/ungdomsrad/${encodeURIComponent(councilId)}${path}`, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || "Kunne ikke kontakte rådet.");
    error.status = response.status;
    throw error;
  }
  return result;
}

export function validateCouncilSession(councilId) {
  return request(councilId, "/session", { headers: headers(councilId), cache: "no-store" });
}

export async function fetchCouncilDelegates(councilId) {
  const result = await request(councilId, "/delegates", { headers: headers(councilId), cache: "no-store" });
  return Array.isArray(result.items) ? result.items : [];
}

export function saveCouncilDelegates(councilId, delegates) {
  return request(councilId, "/delegates", {
    method: "PUT",
    headers: headers(councilId, true),
    body: JSON.stringify({ delegates }),
  });
}

export function redirectToCouncilSelector(councilId) {
  const url = new URL("../handlingsplan/raad-oversikt.html", window.location.href);
  if (councilId) url.searchParams.set("council", councilId);
  window.location.replace(url.toString());
}
