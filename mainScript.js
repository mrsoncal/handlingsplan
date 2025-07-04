
const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTf-bAq0V8H8vLpSSEzpf18GPcW7ZROEK-MMNvy99Mbz3Be8EQ63By7hGofAg5R2Od7KUYtr95w23JO/pub?output=csv";
let currentIndex = 0;

function showLogin() {
    document.getElementById("loginModal").style.display = "flex";
}

function checkLogin(event) {
    event.preventDefault();
    const password = document.getElementById("adminPass").value;
    if (password === "admin123") {
    document.getElementById("loginModal").style.display = "none";
    document.querySelectorAll(".vedta-button").forEach(btn => btn.style.display = "inline-block");
    document.getElementById("adminLoginBtn").style.display = "none";
    document.getElementById("logoutBtn").style.display = "inline-block";
    localStorage.setItem("adminLoggedIn", "true");
    } else {
    alert("Feil passord. Prøv igjen.");
    }
}

function logout() {
    document.querySelectorAll(".vedta-button").forEach(btn => btn.style.display = "none");
    document.getElementById("adminLoginBtn").style.display = "inline-block";
    document.getElementById("logoutBtn").style.display = "none";
    localStorage.removeItem("adminLoggedIn");
}

function checkStoredLogin() {
    if (localStorage.getItem("adminLoggedIn") === "true") {
    document.querySelectorAll(".vedta-button").forEach(btn => btn.style.display = "inline-block");
    document.getElementById("adminLoginBtn").style.display = "none";
    document.getElementById("logoutBtn").style.display = "inline-block";
    }
}

// Store vedtatt rows in localStorage
function saveVedtatt(rowId) {
    const stored = JSON.parse(localStorage.getItem('vedtattRows') || '[]');
    if (!stored.includes(rowId)) {
    stored.push(rowId);
    localStorage.setItem('vedtattRows', JSON.stringify(stored));
    }
}

function loadVedtatt() {
    const stored = JSON.parse(localStorage.getItem('vedtattRows') || '[]');
    stored.forEach(id => {
    const row = document.querySelector(`[data-row-id="${id}"]`);
    if (row) {
        row.classList.add('vedtatt');
    }
    });
}

function handleVedtaClick(button) {
    const row = button.closest('tr');
    if (row && !row.classList.contains('vedtatt')) {
    row.classList.add('vedtatt');
    button.classList.add('vedtatt');
    const rowId = row.getAttribute('data-row-id');
    if (rowId) {
        saveVedtatt(rowId);
    }
    }
}

document.addEventListener('DOMContentLoaded', loadVedtatt);

async function loadCSV() {
    const response = await fetch(csvUrl);
    const text = await response.text();
    const rows = text.trim().split("\n").map(row => row.split(","));
    const headers = rows[0];
    const data = rows.slice(1);

    const grouped = {};
    data.forEach(row => {
    const tema = row[2].trim();
    if (!grouped[tema]) grouped[tema] = [];
    grouped[tema].push(row);
    });

    const temaOrder = [
    "Ungdomsdemokrati og Medvirkning",
    "Samferdsel",
    "Utdanning og Kompetanse",
    "Folkehelse",
    "Klima og Miljø",
    "Kultur"
    ];

    const track = document.getElementById("carousel-track");

    temaOrder.forEach(tema => {
    const groupRows = grouped[tema];
    if (!groupRows || groupRows.length === 0) return;

    const slide = document.createElement("div");
    slide.className = "carousel-slide";

    const h2 = document.createElement("h2");
    h2.textContent = tema;
    slide.appendChild(h2);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");

    headers.slice(1).forEach((h, index) => {
        if (index === 1) return; // skip Tema
        const th = document.createElement("th");
        th.textContent = h === "Velg et punkt (nr)" ? "punkt" : h;
        const isMobile = window.innerWidth <= 600;
        const widths = isMobile
        ? [6, 2.5, 8, 8, 8]  // smaller rems on mobile
        : [9.375, 3.75, 12.5, 12.5, 12.5];
        const visibleIndex = index < 1 ? index : index - 1;
        th.style.width = widths[visibleIndex] + "rem";
        if (index === 2) th.style.textAlign = "center";
        tr.appendChild(th);
    });

    const thBtn = document.createElement("th");
    thBtn.className = "button-header";
    tr.appendChild(thBtn);
    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const order = ["Legge til et punkt", "Endre et punkt", "Fjerne et punkt"];
    groupRows.sort((a, b) => {
        const aPunkt = parseInt(a[3], 10) || 0;
        const bPunkt = parseInt(b[3], 10) || 0;
        if (aPunkt !== bPunkt) return aPunkt - bPunkt;
        return order.indexOf(a[1]) - order.indexOf(b[1]);
    }).forEach(row => {
        const tr = document.createElement("tr");
        tr.className = row[1].trim().replace(/\s/g, "-");

        row.slice(1).forEach((cell, index) => {
        if (index === 1) return;
        const td = document.createElement("td");
        const widths = isMobile
            ? [6, 2.5, 8, 8, 8]
            : [9.375, 3.75, 12.5, 12.5, 12.5];
        const visibleIndex = index < 1 ? index : index - 1;
        td.style.width = widths[visibleIndex] + "rem";
        if (index === 2) td.style.textAlign = "center";
        if (visibleIndex === 0) {
            const tagDiv = document.createElement("div");
            tagDiv.className = "tag-label";
            tagDiv.textContent = cell;
            td.appendChild(tagDiv);
        } else {
            td.textContent = cell;
        }
        tr.appendChild(td);
        });

        const tdAction = document.createElement("td");
        tdAction.className = "button-cell";
        const btn = document.createElement("button");
        btn.textContent = "Vedta";
        btn.className = "vedta-button";
        btn.onclick = () => {
        tr.classList.toggle("vedtatt");
        };
        tdAction.appendChild(btn);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    const wrapper = document.createElement("div");
    wrapper.className = "table-wrapper";
    wrapper.appendChild(table);

    slide.appendChild(wrapper);
    track.appendChild(slide);
    });

    updateCarousel();
    checkStoredLogin();
}

function updateCarousel() {
    const track = document.getElementById("carousel-track");
    const totalSlides = track.children.length;
    currentIndex = (currentIndex + totalSlides) % totalSlides;
    track.style.transform = `translateX(-${currentIndex * 100}%)`;
}

function nextSlide() {
    currentIndex++;
    updateCarousel();
}

function prevSlide() {
    currentIndex--;
    updateCarousel();
}

window.addEventListener("DOMContentLoaded", loadCSV);