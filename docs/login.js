async function login() {
const email = document.getElementById("email").value.trim();
const password = document.getElementById("password").value.trim();
const status = document.getElementById("login-status");

const response = await fetch("https://your-backend-api.com/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
});

const result = await response.json();

if (response.ok) {
    localStorage.setItem("token", result.token); // Save token
    status.textContent = "Innlogging vellykket!";
    document.getElementById("login-section").style.display = "none";
    // Optionally unlock other content
} else {
    status.textContent = "Feil e-post eller passord.";
}
}
