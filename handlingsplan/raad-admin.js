const API_BASE = window.HP_API_BASE;
const raadId = new URLSearchParams(location.search).get("id");
let raadData = null;

document.getElementById("back-link").href = `raad.html?id=${raadId}`;

// --- AUTH HEADER ---
function authHeader() {
  const t = localStorage.getItem("token");
  return t ? { "Authorization": "Bearer " + t } : {};
}

// --- UPLOAD FILE ---
async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: fd,
    headers: authHeader()
  });
  const data = await res.json();
  return data.path;
}

// --- FETCH SINGLE RÅD ---
async function fetchRaad() {
  const res = await fetch(`${API_BASE}/api/ungdomsrad/${raadId}`, {
    headers: authHeader()
  });
  raadData = await res.json();
}

// --- RENDER TEMA-LISTE ---
function renderTemaList() {
  const list = document.getElementById("tema-list");
  list.innerHTML = "";
  raadData.temaer.forEach((t, i) => {
    const c = document.createElement("div");
    c.className = "card";
    c.style.marginBottom = "1rem";

    c.innerHTML = `
      <div class="tema-header" style="cursor:pointer;">
        <strong>${t.name}</strong>
      </div>
      <div class="tema-body" style="display:none;margin-top:.5rem;">
        <label>Navn:</label>
        <input class="tema-name" data-i="${i}" value="${t.name}">
        <label>Farge:</label>
        <input type="color" class="tema-color" data-i="${i}" value="${t.color || "#cccccc"}">
        <button class="btn del-tema" data-i="${i}" style="background:#b7173d;color:white;margin-top:.5rem;">Slett</button>
      </div>
    `;

    list.appendChild(c);

    c.querySelector(".tema-header").onclick = () => {
      const b = c.querySelector(".tema-body");
      b.style.display = b.style.display === "none" ? "block" : "none";
    };
  });
}

// --- INIT ADMIN ---
async function initAdmin() {
  await fetchRaad();

  document.getElementById("raad-name").value = raadData.name;

  if (raadData.logo_path) {
    const prev = document.getElementById("logo-preview");
    prev.src = `${API_BASE}${raadData.logo_path}`;
    prev.style.display = "block";
  }

  document.getElementById("chk-legge-til").checked = raadData.edit_permissions?.legge_til;
  document.getElementById("chk-endre").checked = raadData.edit_permissions?.endre;
  document.getElementById("chk-fjerne").checked = raadData.edit_permissions?.fjerne;

  renderTemaList();
}

// --- LOGO PREVIEW ---
document.getElementById("raad-logo").onchange = e => {
  const prev = document.getElementById("logo-preview");
  prev.src = URL.createObjectURL(e.target.files[0]);
  prev.style.display = "block";
};

// --- ADD TEMA ---
document.getElementById("add-tema-btn").onclick = () => {
  raadData.temaer.push({ name: "Nytt tema", color: "#cccccc" });
  renderTemaList();
};

// --- DELETE TEMA ---
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("del-tema")) {
    if (!confirm("Slette tema?")) return;
    raadData.temaer.splice(+e.target.dataset.i, 1);
    renderTemaList();
  }
});

// --- LOGIN ---
document.getElementById("login-btn").onclick = async () => {
  const pw = document.getElementById("admin-password").value;

  const res = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: pw })
  });

  if (!res.ok) {
    alert("Feil passord");
    return;
  }

  const data = await res.json();
  localStorage.setItem("token", data.token);

  document.getElementById("login-section").style.display = "none";
  document.getElementById("admin-section").style.display = "block";

  initAdmin();
};

// --- SAVE ---
document.getElementById("save-btn").onclick = async () => {
  const status = document.getElementById("save-status");
  status.innerText = "Lagrer...";
  document.getElementById("save-btn").disabled = true;

  const logoFile = document.getElementById("raad-logo").files[0];
  if (logoFile) raadData.logo_path = await uploadFile(logoFile);

  const hpFile = document.getElementById("raad-handlingsplan").files[0];
  if (hpFile) raadData.handlingsplan_path = await uploadFile(hpFile);

  document.querySelectorAll(".tema-name").forEach(inp => {
    raadData.temaer[inp.dataset.i].name = inp.value.trim();
  });

  document.querySelectorAll(".tema-color").forEach(inp => {
    raadData.temaer[inp.dataset.i].color = inp.value;
  });

  raadData.edit_permissions = {
    legge_til: document.getElementById("chk-legge-til").checked,
    endre: document.getElementById("chk-endre").checked,
    fjerne: document.getElementById("chk-fjerne").checked
  };

  const res = await fetch(`${API_BASE}/api/ungdomsrad/${raadId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeader()
    },
    body: JSON.stringify(raadData)
  });

  status.innerText = res.ok ? "Lagret!" : "Feil ved lagring";
  document.getElementById("save-btn").disabled = false;
};
