const raadId = new URLSearchParams(location.search).get("id");
let raadData = null;

async function fetchRaad() {
  const res = await fetch(`/api/raad/${raadId}`);
  raadData = await res.json();
}

function renderTemaList() {
  const list = document.getElementById("tema-list");
  list.innerHTML = "";
  raadData.temaer.forEach((t, idx) => {
    const box = document.createElement("div");
    box.className = "card";
    box.style.marginBottom = "1rem";

    box.innerHTML = `
      <div class="tema-header" style="cursor:pointer;">
        <strong>${t.name}</strong>
      </div>
      <div class="tema-body" style="display:none; margin-top:0.5rem;">
        <label>Navn:</label>
        <input type="text" data-idx="${idx}" class="tema-name" value="${t.name}" />

        <label>Farge:</label>
        <input type="color" data-idx="${idx}" class="tema-color" value="${t.color || "#cccccc"}" />

        <button data-idx="${idx}" class="slett-tema btn" style="background:#b7173d; color:white; margin-top:0.5rem;">Slett tema</button>
      </div>
    `;
    list.appendChild(box);

    box.querySelector(".tema-header").addEventListener("click", () => {
      const body = box.querySelector(".tema-body");
      body.style.display = body.style.display === "none" ? "block" : "none";
    });
  });
}

async function initAdmin() {
  await fetchRaad();

  document.getElementById("raad-name").value = raadData.name;

  document.getElementById("chk-legge-til").checked = raadData.edit_permissions?.legge_til;
  document.getElementById("chk-endre").checked = raadData.edit_permissions?.endre;
  document.getElementById("chk-fjerne").checked = raadData.edit_permissions?.fjerne;

  renderTemaList();
}

document.getElementById("login-btn").onclick = async () => {
  const pw = document.getElementById("admin-password").value;
  const ok = await fetch("/api/login-check", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({password: pw})
  });
  if (ok.status === 200) {
    document.getElementById("login-section").style.display = "none";
    document.getElementById("admin-section").style.display = "block";
    initAdmin();
  } else {
    alert("Feil passord");
  }
};

document.getElementById("add-tema-btn").onclick = () => {
  raadData.temaer.push({name:"Nytt tema", color:"#cccccc"});
  renderTemaList();
};

document.addEventListener("click", e => {
  if (e.target.classList.contains("slett-tema")) {
    const idx = +e.target.dataset.idx;
    raadData.temaer.splice(idx,1);
    renderTemaList();
  }
});

document.getElementById("save-btn").onclick = async () => {
  const temaNames = document.querySelectorAll(".tema-name");
  const temaColors = document.querySelectorAll(".tema-color");

  temaNames.forEach((input, i) => {
    raadData.temaer[i].name = input.value;
  });
  temaColors.forEach((input, i) => {
    raadData.temaer[i].color = input.value;
  });

  raadData.edit_permissions = {
    legge_til: document.getElementById("chk-legge-til").checked,
    endre: document.getElementById("chk-endre").checked,
    fjerne: document.getElementById("chk-fjerne").checked
  };

  await fetch(`/api/raad/${raadId}`, {
    method: "PATCH",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(raadData)
  });

  alert("Lagret!");
};
