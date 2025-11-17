const API_BASE = window.HP_API_BASE;
const raadId = new URLSearchParams(location.search).get("id");
let raadData = null;

document.getElementById("back-link").href = `raad.html?id=${raadId}`;

function authHeader() {
  const t = localStorage.getItem("token");
  return t ? { "Authorization": "Bearer " + t } : {};
}

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

async function fetchRaad() {
  const res = await fetch(`${API_BASE}/api/ungdomsrad/${raadId}`, {
    headers: authHeader()
  });
  raadData = await res.json();
}

function safeUrl(path) {
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

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
        
        <button class="btn del-tema" data-i="${i}" style="background:#b7173d;color:white;margin-top:.5rem;">
          Slett
        </button>
      </div>
    `;

    list.appendChild(c);

    c.querySelector(".tema-header").onclick = () => {
      const b = c.querySelector(".tema-body");
      b.style.display = b.style.display === "none" ? "block" : "none";
    };
  });
}

async function initAdmin() {
  await fetchRaad();

  document.getElementById("raad-name").value = raadData.name;

  if (raadData.logo_path) {
    const prev = document.getElementById("logo-preview");
    prev.src = safeUrl(raadData.logo_path);
    prev.style.display = "block";
  }

  document.getElementById("chk-legge-til").checked = raadData.edit_permissions?.legge_til;
  document.getElementById("chk-endre").checked = raadData.edit_permissions?.endre;
  document.getElementById("chk-fjerne").checked = raadData.edit_permissions?.fjerne;

  renderTemaList();
}

document.getElementById("raad-logo").onchange = e => {
  const prev = document.getElementById("logo-preview");
  prev.src = URL.createObjectURL(e.target.files[0]);
  prev.style.display = "block";
};

document.getElementById("add-tema-btn").onclick = () => {
  raadData.temaer.push({ name: "Nytt tema", color: "#cccccc" });
  renderTemaList();
};

document.addEventListener("click", e => {
  if (e.target.classList.contains("del-tema")) {
    if (confirm("Slette tema?")) {
      raadData.temaer.splice(+e.target.dataset.i, 1);
      renderTemaList();
    }
  }
});

document.getElementById("login-btn").onclick = async () => {
  const pw = document.getElementById("admin-password").value;

  const res = await fetch(`${API_BASE}/api/admin/login`, {
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
