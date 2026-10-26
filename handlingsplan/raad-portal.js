const API_BASE = window.HP_API_BASE || "";
const councilId = new URLSearchParams(window.location.search).get("id");

function returnToSelector() {
  const url = new URL("raad-oversikt.html", window.location.href);
  if (councilId) url.searchParams.set("council", councilId);
  window.location.replace(url.toString());
}

async function initializePortal() {
  const status = document.getElementById("portal-status");
  const statusMessage = document.getElementById("portal-status-message");
  const retry = document.getElementById("portal-retry");
  statusMessage.textContent = "Kontrollerer rådstilgangen …";
  retry.hidden = true;
  const session = window.HPCouncilSession?.get(councilId);
  if (!session) {
    returnToSelector();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/ungdomsrad/${encodeURIComponent(councilId)}/session`, {
      headers: { "X-Council-Session": session.token },
      cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) {
      window.HPCouncilSession?.clear(councilId);
      returnToSelector();
      return;
    }
    if (!response.ok) throw new Error("Rådsportalen kunne ikke lastes.");
    const result = await response.json();
    const council = result.council;
    if (!council) throw new Error("Siden kunne ikke lastes.");

    const name = council.display_name || council.name || "Råd eller organisasjon";
    document.title = `Portal – ${name}`;
    document.getElementById("portal-council-name").textContent = name;
    document.getElementById("portal-plan-link").href = `raad-admin.html?id=${encodeURIComponent(councilId)}`;
    document.getElementById("portal-talestolen-link").href = `../talestolen/?id=${encodeURIComponent(councilId)}`;
    document.getElementById("portal-registration-link").href = `raad-paamelding-admin.html?id=${encodeURIComponent(councilId)}`;
    document.getElementById("portal-content").hidden = false;
    status.hidden = true;
  } catch (error) {
    statusMessage.textContent = error.message || "Rådsportalen kunne ikke lastes. Kontroller tilkoblingen og prøv igjen.";
    retry.hidden = false;
  }
}

document.getElementById("portal-logout")?.addEventListener("click", () => {
  window.HPCouncilSession?.clear(councilId);
  returnToSelector();
});
document.getElementById("portal-retry")?.addEventListener("click", initializePortal);

initializePortal();
