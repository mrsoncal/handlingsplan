const passwordInput = document.getElementById("password");
const loginForm = document.getElementById("login-form");

// Use same base as the other pages
const LOGIN_API_BASE = window.HP_API_BASE ||
  "https://qeb2527k.function2.insforge.app/handlingsplan-api";

if (loginForm && passwordInput) loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = passwordInput.value;

  const response = await fetch(`${LOGIN_API_BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  const data = await response.json();

  if (response.ok) {
    localStorage.setItem("token", data.token);
    window.location.reload();
  } else {
    const statusEl = document.getElementById("login-status");
    if (statusEl) {
      statusEl.textContent = "Feil passord. Prøv igjen.";
      statusEl.dataset.type = "error";
    }
  }
});

// Password toggle (unchanged)
document.addEventListener("DOMContentLoaded", () => {
  const passwordInput = document.getElementById("password");
  const togglePasswordBtn = document.getElementById("togglePassword");
  const toggleIcon = document.getElementById("togglePasswordIcon");

  if (passwordInput && togglePasswordBtn && toggleIcon) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      toggleIcon.src = isPassword ? "hide.png" : "visible.png";
      toggleIcon.alt = isPassword ? "Skjul passord" : "Vis passord";
    });
  }
});
