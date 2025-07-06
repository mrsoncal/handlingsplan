const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTf-bAq0V8H8vLpSSEzpf18GPcW7ZROEK-MMNvy99Mbz3Be8EQ63By7hGofAg5R2Od7KUYtr95w23JO/pub?output=csv";
const isMobile = window.innerWidth <= 600;
const track = document.getElementById("carousel-track");
if (isMobile && track) track.classList.add("stacked");
        let currentIndex = 0;

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");

  if (!token) {
    // Not logged in
    document.getElementById("login-section").style.display = "block";
    document.getElementById("main-content").style.display = "none";
  } else {
    // Logged in
    document.getElementById("login-section").style.display = "none";
    document.getElementById("main-content").style.display = "block";
  }
});

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

async function loadCSV() {
    try {
    console.log("[DEBUG] Starting CSV load...");

    const response = await fetch(csvUrl);
    console.log("[DEBUG] Response status:", response.status);

    if (!response.ok) {
        console.error("[ERROR] Fetch failed with status:", response.statusText);
        document.getElementById("carousel-track").innerHTML = "<p>Kunne ikke laste inn data.</p>";
        return;
    }

    const text = await response.text();
    console.log("[DEBUG] CSV raw text (first 500 chars):", text.slice(0, 500));

    const rows = text.trim().split("\n").map(row => row.split(","));
    console.log("[DEBUG] Total rows parsed:", rows.length);

    if (rows.length < 2) {
        console.warn("[WARNING] Not enough data rows in CSV");
        return;
    }

    const headers = rows[0];
    const data = rows.slice(1);
    console.log("[DEBUG] Headers:", headers);
    console.log("[DEBUG] First data row:", data[0]);

    const grouped = {};
    data.forEach(row => {
        const tema = row[2]?.trim();
        if (!tema) {
        console.warn("[WARNING] Skipped row with missing tema:", row);
        return;
        }
        if (!grouped[tema]) grouped[tema] = [];
        grouped[tema].push(row);
    });

    console.log("[DEBUG] Grouped tema keys:", Object.keys(grouped));

    const temaOrder = [
        "Ungdomsdemokrati og Medvirkning",
        "Samferdsel",
        "Utdanning og Kompetanse",
        "Folkehelse",
        "Klima og Miljø",
        "Kultur"
    ];

    const track = document.getElementById("carousel-track");
    const isMobile = window.innerWidth <= 600;

    temaOrder.forEach(tema => {
        const groupRows = grouped[tema];
        console.log(`[DEBUG] Processing tema "${tema}" with ${groupRows?.length || 0} rows`);
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
        if (index === 1) return;
        const th = document.createElement("th");
        th.textContent = h === "Velg et punkt (nr)" ? "punkt" : h;
        tr.appendChild(th);
        });

        const thBtn = document.createElement("th");
        thBtn.className = "button-header";
        tr.appendChild(thBtn);
        thead.appendChild(tr);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        groupRows.forEach(row => {
        const tr = document.createElement("tr");
        tr.className = row[1]?.trim().replace(/\s/g, "-");

        row.slice(1).forEach((cell, index) => {
            if (index === 1) return;
            const td = document.createElement("td");
            if (index === 2) td.style.textAlign = "center";

            if (index === 0) {
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

    console.log("[DEBUG] Finished populating slides");
    updateCarousel();
    } catch (error) {
    console.error("[ERROR] Exception in loadCSV:", error);
    }
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