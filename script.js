document.addEventListener("DOMContentLoaded", () => {
  // === Load CSV Data ===
  function loadCSV() {
    fetch("Handlingsplan Telemark Ungdomsråd 2025.csv")
      .then((response) => response.text())
      .then((csvData) => {
        const rows = csvData.split("\n").map((row) => row.split(","));
        const table = document.getElementById("data-table");
        const thead = table.querySelector("thead");
        const tbody = table.querySelector("tbody");

        if (!thead || !tbody) return;

        // Clear existing rows
        thead.innerHTML = "";
        tbody.innerHTML = "";

        // Add header
        const headerRow = document.createElement("tr");
        rows[0].forEach((cell) => {
          const th = document.createElement("th");
          th.textContent = cell;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        // Add data rows
        for (let i = 1; i < rows.length; i++) {
          const row = document.createElement("tr");
          rows[i].forEach((cell) => {
            const td = document.createElement("td");
            td.textContent = cell;
            row.appendChild(td);
          });
          tbody.appendChild(row);
        }
      })
      .catch((error) => console.error("Failed to load CSV:", error));
  }

  loadCSV();

  // === Login Handling ===
  const token = localStorage.getItem("token");
  const loginSection = document.getElementById("login-section");
  const loginButton = document.getElementById("login-button");
  const mainContent = document.getElementById("main-content");

  if (!loginSection || !loginButton || !mainContent) {
    console.warn("One or more login-related elements are missing.");
    return;
  }

  if (!token) {
    loginButton.style.display = "inline-block";
    loginSection.style.display = "none";
    mainContent.style.display = "none";
  } else {
    loginButton.style.display = "none";
    loginSection.style.display = "none";
    mainContent.style.display = "block";
  }

  loginButton.addEventListener("click", () => {
    loginSection.style.display = "block";
    loginButton.style.display = "none";
    console.log("Login form shown.");
  });
});
