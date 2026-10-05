// raad-oversikt.js

const API_BASE = window.HP_API_BASE || "";
const COUNCILS_URL = `${API_BASE}/api/ungdomsrad`;

let allCouncils = [];
let addCardEl = null;
let activeModal = null;
let modalReturnTarget = null;
let passwordCouncil = null;

function getFocusableElements(modal) {
  return Array.from(modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
}

function openModal(modal, trigger) {
  if (!modal) return;
  activeModal = modal;
  modalReturnTarget = trigger || document.activeElement;
  modal.style.display = "flex";
  const focusable = getFocusableElements(modal);
  (focusable[0] || modal.querySelector(".login-box"))?.focus();
}

function closeModal(modal = activeModal) {
  if (!modal) return;
  modal.style.display = "none";
  activeModal = null;
  modalReturnTarget?.focus();
  modalReturnTarget = null;
}

document.addEventListener("keydown", (event) => {
  if (!activeModal) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = getFocusableElements(activeModal);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// --- AUTH HELPERS ---

function isAdmin() {
  return !!localStorage.getItem("token");
}

function setupAuthUI() {
  const token = localStorage.getItem("token");
  const loginSection = document.getElementById("login-section");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");

  if (!loginSection || !loginButton || !logoutButton) return;

  if (!token) {
    loginSection.style.display = "none";
    loginButton.style.display = "inline-block";
    logoutButton.style.display = "none";
    document.body.classList.remove("logged-in");
  } else {
    loginSection.style.display = "none";
    loginButton.style.display = "none";
    logoutButton.style.display = "inline-block";
    document.body.classList.add("logged-in");
  }

  loginButton.addEventListener("click", () => {
    openModal(loginSection, loginButton);
  });

  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("token");
    setupAuthUI();
    renderCouncils(); // or fetchCouncils() if you prefer a fresh load
  });


  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = document.getElementById("password")?.value;

      try {
        const res = await fetch(`${API_BASE}/api/admin/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });

        if (!res.ok) {
          throw new Error("Feil passord");
        }

        const data = await res.json();
        localStorage.setItem("token", data.token);
        closeModal(loginSection);
        setupAuthUI();
        renderCouncils(); // <--- add this line

      } catch (err) {
        console.error(err);
        alert("Innlogging feilet. Sjekk passordet.");
      }
    });
  }

  const togglePasswordBtn = document.getElementById("togglePassword");
  const passwordInput = document.getElementById("password");
  const togglePasswordIcon = document.getElementById("togglePasswordIcon");

  if (togglePasswordBtn && passwordInput && togglePasswordIcon) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      togglePasswordIcon.src = isPassword ? "../eye-open.svg" : "../eye-closed.svg";
      togglePasswordIcon.alt = isPassword ? "Skjul passord" : "Vis passord";
    });
  }

  const councilPasswordInput = document.getElementById("councilPassword");
  const toggleCouncilPasswordBtn = document.getElementById("toggleCouncilPassword");
  const toggleCouncilPasswordIcon = document.getElementById("toggleCouncilPasswordIcon");

  if (toggleCouncilPasswordBtn && councilPasswordInput && toggleCouncilPasswordIcon) {
    toggleCouncilPasswordBtn.addEventListener("click", () => {
      const isPassword = councilPasswordInput.type === "password";
      councilPasswordInput.type = isPassword ? "text" : "password";
      toggleCouncilPasswordIcon.src = isPassword ? "../eye-open.svg" : "../eye-closed.svg";
      toggleCouncilPasswordIcon.alt = isPassword ? "Skjul passord" : "Vis passord";
    });
  }


}

// --- NAVIGASJON ---

function goToCouncil(council) {
  window.location.href = `raad.html?id=${encodeURIComponent(council.id)}`;
}

// --- DELETE ---

async function deleteCouncil(council) {
  if (!isAdmin()) {
    alert("Du må være logget inn som admin for å slette et ungdomsråd.");
    return;
  }

  const confirmDelete = confirm(
    `Er du sikker på at du vil slette ungdomsrådet "${council.display_name || council.name}"? ` +
      "Denne handlingen kan ikke angres."
  );

  if (!confirmDelete) return;

  const token = localStorage.getItem("token");

  try {
    const res = await fetch(
      `${COUNCILS_URL}/${encodeURIComponent(council.id)}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    );

    if (!res.ok && res.status !== 204) {
      throw new Error("Kunne ikke slette ungdomsråd.");
    }

    await fetchCouncils();
  } catch (err) {
    console.error(err);
    alert("Det oppstod en feil ved sletting av ungdomsråd.");
  }
}

function openPasswordModal(council, trigger) {
  const overlay = document.getElementById("changePasswordOverlay");
  const form = document.getElementById("changePasswordForm");
  const councilLabel = document.getElementById("change-password-council");
  const status = document.getElementById("change-password-status");
  if (!overlay || !form) return;

  passwordCouncil = council;
  form.reset();
  form.dataset.submitting = "false";
  if (councilLabel) {
    councilLabel.textContent = council.display_name || council.name || `Ungdomsråd #${council.id}`;
  }
  if (status) {
    status.textContent = "";
    status.className = "form-status";
  }
  openModal(overlay, trigger);
  document.getElementById("newCouncilPassword")?.focus();
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.getElementById("change-password-status");
  const newPassword = document.getElementById("newCouncilPassword")?.value || "";
  const confirmedPassword = document.getElementById("confirmCouncilPassword")?.value || "";

  if (!passwordCouncil || form.dataset.submitting === "true") return;
  if (newPassword.length < 6) {
    if (status) status.textContent = "Passordet må ha minst 6 tegn.";
    return;
  }
  if (newPassword !== confirmedPassword) {
    if (status) status.textContent = "Passordene er ikke like.";
    return;
  }

  const token = localStorage.getItem("token");
  if (!token) {
    if (status) status.textContent = "Du må logge inn som global administrator først.";
    return;
  }

  form.dataset.submitting = "true";
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  if (status) status.textContent = "Lagrer …";

  try {
    const response = await fetch(
      `${COUNCILS_URL}/${encodeURIComponent(passwordCouncil.id)}/password`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: newPassword }),
      }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("token");
        setupAuthUI();
        renderCouncils();
      }
      throw new Error(result.error || "Kunne ikke endre passordet.");
    }

    if (status) {
      status.textContent = "Passordet er endret.";
      status.className = "form-status form-status-success";
    }
    window.setTimeout(() => closeModal(document.getElementById("changePasswordOverlay")), 650);
  } catch (error) {
    console.error(error);
    if (status) {
      status.textContent = error.message || "Kunne ikke endre passordet.";
      status.className = "form-status form-status-error";
    }
  } finally {
    form.dataset.submitting = "false";
    if (submitButton) submitButton.disabled = false;
  }
}

// --- RENDER HJELPER ---

function renderCouncils() {
  const gridEl = document.getElementById("raadGrid");
  const emptyEl = document.getElementById("councilListEmpty");
  const searchInput = document.getElementById("raadSearch");

  if (!gridEl) return;
  if (!addCardEl) {
    addCardEl = gridEl.querySelector(".raad-card-add");
  }

  const term = (searchInput?.value || "").trim().toLowerCase();

  let list = allCouncils;
  if (term) {
    list = allCouncils.filter((c) => {
      const name = (c.display_name || c.name || "").toLowerCase();
      return name.includes(term);
    });
  }

  gridEl.innerHTML = "";
  if (addCardEl) {
    gridEl.appendChild(addCardEl);
  }

  if (!allCouncils.length) {
    if (emptyEl) {
      emptyEl.style.display = "block";
      emptyEl.textContent =
        "Ingen ungdomsråd er opprettet ennå. Bruk kortet «Legg til nytt ungdomsråd» for å opprette ett.";
    }
    return;
  }

  if (!list.length) {
    if (emptyEl) {
      emptyEl.style.display = "block";
      emptyEl.textContent = "Ingen ungdomsråd matcher søket.";
    }
    return;
  }

  if (emptyEl) {
    emptyEl.style.display = "none";
  }

  const admin = isAdmin();

  list.forEach((council) => {
    const card = document.createElement("article");
    card.className = "raad-card";

    const name =
      council.display_name || council.name || `Ungdomsråd #${council.id}`;
    const created = council.created_at
      ? new Date(council.created_at).toLocaleDateString("nb-NO")
      : "";

    // === LEFT DIV: ICON ===
    const iconWrap = document.createElement("div");
    iconWrap.className = "raad-card-icon-wrap";

    const icon = document.createElement("img");

    // Default logo when no custom logo is uploaded
    let logoSrc = "../UFR-logo.png";

    // If this council has a stored logo in the DB, use the logo-file endpoint
    if (council.has_logo) {
      logoSrc = `${API_BASE}/api/ungdomsrad/${encodeURIComponent(
        council.id
      )}/logo-file?v=${encodeURIComponent(council.logo_version || "current")}`;
    }

    icon.src = logoSrc;
    icon.alt = `Logo for ${name}`;
    icon.className = "raad-card-icon";

    iconWrap.appendChild(icon);


    // === RIGHT DIV: TITLE + META + ACTIONS ===
    const body = document.createElement("div");
    body.className = "raad-card-body";

    const title = document.createElement("h3");
    title.className = "raad-card-title";
    title.textContent = name;
    body.appendChild(title);

    if (created) {
      const meta = document.createElement("p");
      meta.className = "raad-card-meta";
      meta.textContent = `Opprettet ${created}`;
      body.appendChild(meta);
    }

    const actions = document.createElement("div");
    actions.className = "raad-card-actions";

    if (admin) {
      const passwordBtn = document.createElement("button");
      passwordBtn.type = "button";
      passwordBtn.className = "btn council-password-btn";
      passwordBtn.textContent = "Endre passord";
      passwordBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openPasswordModal(council, passwordBtn);
      });
      actions.appendChild(passwordBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn council-delete-btn";
      deleteBtn.textContent = "Slett";
      deleteBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteCouncil(council);
      });
      actions.appendChild(deleteBtn);
    }

    body.appendChild(actions);

    // === Combine into card ===
    card.appendChild(iconWrap);
    card.appendChild(body);

    // Hele kortet er klikkbart
    card.addEventListener("click", () => {
      goToCouncil(council);
    });

    gridEl.appendChild(card);
  });
}


// --- HENT RÅD ---

async function fetchCouncils() {
  const gridEl = document.getElementById("raadGrid");
  const emptyEl = document.getElementById("councilListEmpty");
  if (!gridEl) return;

  gridEl.setAttribute("aria-busy", "true");
  const skeletons = Array.from({ length: 3 }, () => {
    const skeleton = document.createElement("div");
    skeleton.className = "raad-card skeleton-panel";
    skeleton.setAttribute("aria-hidden", "true");
    skeleton.innerHTML = '<span class="skeleton-line skeleton-line-title"></span><span class="skeleton-line"></span>';
    return skeleton;
  });
  skeletons.forEach((skeleton) => gridEl.appendChild(skeleton));

  try {
    const res = await fetch(COUNCILS_URL);
    if (!res.ok) throw new Error("Kunne ikke hente ungdomsråd.");
    const councils = await res.json();

    allCouncils = Array.isArray(councils) ? councils : [];
    renderCouncils();
  } catch (err) {
    console.error(err);
    if (emptyEl) {
      emptyEl.style.display = "block";
      emptyEl.textContent =
        "Det oppstod en feil ved henting av ungdomsråd. Prøv å laste siden på nytt.";
    }
  } finally {
    gridEl.setAttribute("aria-busy", "false");
  }
}

// --- NYTT UNGDOMSRÅD ---

async function handleNewCouncil(event) {
  event.preventDefault();
  const form = event.currentTarget;

  if (form.dataset.submitting === "true") {
    return;
  }
  form.dataset.submitting = "true";

    const nameInput = form.querySelector("#councilName");
    const passwordInput = form.querySelector("#councilPassword");
    const logoFileInput = form.querySelector("#councilLogoFile");

    const name = nameInput?.value.trim();
    const password = passwordInput?.value.trim();
    const logoFile = logoFileInput?.files?.[0] || null;


  if (!name) {
    alert("Skriv inn navn på ungdomsråd.");
    form.dataset.submitting = "false";
    return;
  }

  if (!password) {
    alert("Sett et passord for ungdomsrådet.");
    form.dataset.submitting = "false";
    return;
  }

  try {
    const res = await fetch(COUNCILS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, password }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || "Kunne ikke opprette ungdomsråd.");
    }

    const created = await res.json();


    if (logoFile) {
      try {
        const fd = new FormData();
        fd.append("password", password);
        fd.append("logo", logoFile);

        const uploadRes = await fetch(
          `${COUNCILS_URL}/${encodeURIComponent(created.id)}/logo`,
          {
            method: "POST",
            body: fd,
          }
        );

        if (!uploadRes.ok) {
          console.warn("Logo-opplasting feilet, men rådet ble opprettet likevel.");
        }
      } catch (logoErr) {
        console.error("Feil ved opplasting av logo:", logoErr);
      }
    }

    if (nameInput) nameInput.value = "";
    if (passwordInput) passwordInput.value = "";
    if (logoFileInput) logoFileInput.value = "";


    if (nameInput) nameInput.value = "";
    if (passwordInput) passwordInput.value = "";

    // Lukk overlay og gå rett til nytt råd
    const overlay = document.getElementById("newCouncilOverlay");
    if (overlay) {
      overlay.style.display = "none";
    }

    goToCouncil(created);
  } catch (err) {
    console.error(err);
    alert("Det oppstod en feil ved opprettelse av ungdomsråd.");
  } finally {
    form.dataset.submitting = "false";
  }
}

// --- INIT ---

document.addEventListener("DOMContentLoaded", () => {
  setupAuthUI();

  const form = document.getElementById("newCouncilForm");
  if (form) {
    form.addEventListener("submit", handleNewCouncil);
  }

  const searchInput = document.getElementById("raadSearch");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderCouncils();
    });
  }

  const addCard = document.getElementById("raadAddCard");
  const newCouncilOverlay = document.getElementById("newCouncilOverlay");
  const cancelNewCouncilBtn = document.getElementById("cancelNewCouncil");
  const changePasswordOverlay = document.getElementById("changePasswordOverlay");

  if (addCard && newCouncilOverlay) {
    const showNewCouncilModal = () => openModal(newCouncilOverlay, addCard);
    addCard.addEventListener("click", showNewCouncilModal);
    addCard.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showNewCouncilModal();
      }
    });
  }

  if (cancelNewCouncilBtn && newCouncilOverlay) {
    cancelNewCouncilBtn.addEventListener("click", () => {
      closeModal(newCouncilOverlay);
    });
  }

  // Klikk utenfor boksen lukker overlay
  if (newCouncilOverlay) {
    newCouncilOverlay.addEventListener("click", (event) => {
      const box = newCouncilOverlay.querySelector(".login-box");
      if (box && !box.contains(event.target)) {
        closeModal(newCouncilOverlay);
      }
    });
  }

  document.getElementById("closeNewCouncilModal")?.addEventListener("click", () => closeModal(newCouncilOverlay));
  document.getElementById("closeLoginModal")?.addEventListener("click", () => closeModal(document.getElementById("login-section")));

  document.getElementById("changePasswordForm")?.addEventListener("submit", handlePasswordChange);
  document.getElementById("cancelChangePassword")?.addEventListener("click", () => closeModal(changePasswordOverlay));
  document.getElementById("closeChangePasswordModal")?.addEventListener("click", () => closeModal(changePasswordOverlay));
  changePasswordOverlay?.addEventListener("click", (event) => {
    const box = changePasswordOverlay.querySelector(".login-box");
    if (box && !box.contains(event.target)) closeModal(changePasswordOverlay);
  });

  fetchCouncils();
});

// CLOSE LOGIN WHEN CLICKING OUTSIDE THE BOX
document.addEventListener("click", (e) => {
  const overlay = document.getElementById("login-section");
  if (!overlay) return;
  if (overlay.style.display === "none") return;

  const box = overlay.querySelector(".login-box");

  // Don't treat clicks on the Admin button as "outside"
  const loginBtn = document.getElementById("login-button");
  if (loginBtn && (e.target === loginBtn || e.target.closest("#login-button"))) {
    return;
  }

  // If click is outside the login box → close
  if (box && !box.contains(e.target)) {
    closeModal(overlay);
    if (loginBtn) {
      loginBtn.style.display = "inline-block";
    }
  }
});

