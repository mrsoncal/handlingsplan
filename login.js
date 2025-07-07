const passwordInput = document.getElementById("password");
const loginForm = document.getElementById("login-form");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = passwordInput.value;

  const response = await fetch("https://handlingsplan-backend.onrender.com/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  const data = await response.json();

  if (response.ok) {
    // Save token globally (localStorage or cookie)
    localStorage.setItem("token", data.token);
    document.getElementById("login-form").style.display = "none";
    document.getElementById("main-content").style.display = "block";
  } else {
    alert("Incorrect password.");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const passwordInput = document.getElementById("password");
  const togglePasswordBtn = document.getElementById("togglePassword");
  const toggleIcon = document.getElementById("togglePasswordIcon");

  if (passwordInput && togglePasswordBtn && toggleIcon) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      toggleIcon.src = isPassword ? "/hide.png" : "/visible.png";
      toggleIcon.alt = isPassword ? "Skjul passord" : "Vis passord";
    });
  }
});
