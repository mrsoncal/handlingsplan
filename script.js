const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTf-bAq0V8H8vLpSSEzpf18GPcW7ZROEK-MMNvy99Mbz3Be8EQ63By7hGofAg5R2Od7KUYtr95w23JO/pub?output=csv";
const isMobile = window.innerWidth <= 600;
const track = document.getElementById("carousel-track");
let currentSlideIndex = 0;
if (isMobile && track) track.classList.add("stacked");
        let currentIndex = 0;

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");

  const loginSection = document.getElementById("login-section");
  const mainContent = document.getElementById("main-content");
  const loginButton = document.getElementById("login-button");
  const logoutButton = document.getElementById("logout-button");

  if (!loginSection || !mainContent || !loginButton) {
    console.warn("One or more required elements are missing.");
    return;
  }

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
    loginSection.style.display = "flex";
    loginButton.style.display = "none";
    });

    logoutButton.addEventListener("click", () => {
    localStorage.removeItem("token");
    location.reload();
    });
});


function handleVedtaClick(tr, btn) {
  tr.classList.toggle("vedtatt");
  const isVedtatt = tr.classList.contains("vedtatt");
  const rowId = tr.dataset.rowId;

  console.log(`[ACTION] Toggling vedtatt for rowId="${rowId}" to ${isVedtatt}`);

  fetch("https://handlingsplan-backend.onrender.com/vedtatt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rowId, vedtatt: isVedtatt }),
  })
    .then((res) => res.json())
    .then((data) => {
      console.log("[SERVER] Save response:", data);
    })
    .catch((err) => {
      console.error("[ERROR] Failed to update vedtatt status:", err);
    });

  btn.classList.toggle("vedtatt", isVedtatt);
  btn.textContent = isVedtatt ? "Vedtatt" : "Vedta";
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

        // ✅ Parse CSV using PapaParse
        Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: async function (results) {
                let data = results.data;

                // ✅ Remove any unexpected keys like "_1"
                data = data.map(row => {
                const cleaned = {};
                for (const key of Object.keys(row)) {
                    if (key && !key.startsWith("_")) {
                    cleaned[key] = row[key];
                    }
                }
                return cleaned;
                });

                const headers = Object.keys(data[0]);
                console.log("[DEBUG] Total rows parsed:", data.length);
                console.log("[DEBUG] Headers:", headers);
                console.log("[DEBUG] First data row:", data[0]);

                // ✅ Load saved vedtatt states
                let savedVedtatt = {};
                try {
                    const res = await fetch("https://handlingsplan-backend.onrender.com/vedtatt");
                    if (res.ok) {
                        savedVedtatt = await res.json();
                        console.log("[DEBUG] Loaded vedtatt statuses:", savedVedtatt);
                    } else {
                        console.warn("[WARNING] Failed to fetch saved vedtatt states");
                    }
                } catch (err) {
                    console.error("[ERROR] Fetching vedtatt states:", err);
                }

                // ✅ Group by tema
                const grouped = {};
                data.forEach(row => {
                    const tema = row["Velg et tema"]?.trim();
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

                temaOrder.forEach((tema, index) => {
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
                    const headerRow = document.createElement("tr");

                    headers.slice(1).forEach((h, i) => {
                        if (h === "Velg et tema") return;
                        const th = document.createElement("th");
                        th.textContent = h === "Velg et punkt (nr)" ? "punkt" : h;
                        headerRow.appendChild(th);
                    });

                    const thBtn = document.createElement("th");
                    thBtn.className = "button-header";
                    headerRow.appendChild(thBtn);
                    thead.appendChild(headerRow);
                    table.appendChild(thead);

                    const tbody = document.createElement("tbody");

                    groupRows.forEach((row, rowIndex) => {
                        const tr = document.createElement("tr");
                        const rowId = `${tema}-${rowIndex}`;
                        tr.dataset.rowId = rowId;
                        tr.className = row["Hva vil du gjøre?"]?.trim().replace(/\s/g, "-");

                        headers.slice(1).forEach((header, index) => {
                            if (header === "Velg et tema") return;
                            const td = document.createElement("td");
                            if (header === "Velg et punkt (nr)") td.style.textAlign = "center";

                            const cell = row[header];
                            if (header === "Hva vil du gjøre?") {
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
                        btn.onclick = () => handleVedtaClick(tr, btn);

                        tdAction.appendChild(btn);
                        tr.appendChild(tdAction);

                        if (savedVedtatt[rowId]) {
                            console.log(`[APPLY] Marking ${rowId} as vedtatt`);
                            tr.classList.add("vedtatt");
                            btn.classList.add("vedtatt");
                            btn.textContent = "Vedtatt";

                            if (!localStorage.getItem("token")) {
                                const label = document.createElement("span");
                                label.className = "vedtatt-label";
                                label.textContent = "✔ Vedtatt!";
                                tdAction.appendChild(label);
                            }
                        }

                        tbody.appendChild(tr);
                    });

                    table.appendChild(tbody);

                    const wrapper = document.createElement("div");
                    wrapper.className = "table-wrapper";
                    wrapper.appendChild(table);
                    slide.appendChild(wrapper);
                    track.appendChild(slide);

                    // ✅ Add filler row
                    let headerBg = "#f0f0f0";
                    const th = slide.querySelector("th:not(.button-header)");
                    if (th) {
                        const computed = window.getComputedStyle(th);
                        headerBg = computed.backgroundColor;
                    }

                    const fillerRow = document.createElement("tr");
                    fillerRow.className = "filler-row";

                    const totalColumns = headers.length - 1;
                    for (let i = 0; i < totalColumns; i++) {
                        const td = document.createElement("td");
                        td.innerHTML = "&nbsp;";
                        td.style.height = "1.25rem";
                        if (i !== totalColumns - 1) td.style.backgroundColor = headerBg;
                        fillerRow.appendChild(td);
                    }

                    tbody.appendChild(fillerRow);
                });

                console.log("[DEBUG] Finished populating slides");
                updateCarousel();
            }
        });
    } catch (error) {
        console.error("[ERROR] Exception in loadCSV:", error);
    }
}


document.getElementById("login-section").addEventListener("click", function (event) {
  const loginBox = document.querySelector(".login-box");
  if (loginBox && !loginBox.contains(event.target)) {
    this.style.display = "none";

    // ✅ Show the login button again
    const loginBtn = document.getElementById("login-button");
    if (loginBtn) loginBtn.style.display = "inline-block";
  }
});

function updateCarousel() {
  const track = document.getElementById("carousel-track");
  const slides = document.querySelectorAll(".carousel-slide");

  slides.forEach((slide, index) => {
    slide.style.display = index === currentIndex ? "block" : "none";
  });

  // ✅ Scroll to top of current slide on desktop
  if (window.innerWidth > 768) {
    const currentSlide = slides[currentIndex];
    if (currentSlide) {
      const topOffset = currentSlide.getBoundingClientRect().top + window.pageYOffset - 20;
      window.scrollTo({
        top: topOffset,
        behavior: "instant" // Use "smooth" for a subtle animation, or "instant" for immediate
      });
    }
  }
}

function nextSlide() {
  const slides = document.querySelectorAll(".carousel-slide");
  if (currentSlideIndex < slides.length - 1) {
    currentSlideIndex++;
    updateCarousel();
  }
}

function prevSlide() {
  if (currentSlideIndex > 0) {
    currentSlideIndex--;
    updateCarousel();
  }
}

window.addEventListener("DOMContentLoaded", loadCSV);
