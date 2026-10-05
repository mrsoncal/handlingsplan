import React, { useMemo, useState, useRef } from "react";
import readXlsxFile, { readSheetNames } from "read-excel-file";

const MAX_EXCEL_FILE_SIZE = 10 * 1024 * 1024;
const REQUIRED_COLUMNS = [
  { key: "delegatnummer", label: "delegatnummer" },
  { key: "fullName", label: "fullt navn" },
  { key: "org", label: "representerer" },
];

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("no")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_ALIASES = {
  delegatnummer: ["delegatnummer", "delegatenummer", "delegatnr", "nummer", "nr", "id"],
  fullName: ["fulltnavn", "navn", "name", "fullname"],
  org: ["representerer", "radelevradorganisasjon", "organisasjon", "elevrad", "rad", "kommune", "org"],
};

function excelColumnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function displayExcelValue(value) {
  if (value instanceof Date) return value.toLocaleDateString("nb-NO");
  if (value == null) return "";
  return String(value);
}

function compactExcelRows(rows) {
  const hasValue = (value) => value != null && String(value).trim() !== "";
  const firstRow = rows.findIndex((row) => row.some(hasValue));
  if (firstRow < 0) return { rows: [], startRow: 1, columnCount: 0 };

  let lastRow = rows.length - 1;
  while (lastRow >= firstRow && !rows[lastRow].some(hasValue)) lastRow -= 1;

  const activeRows = rows.slice(firstRow, lastRow + 1);
  const columnCount = activeRows.reduce((max, row) => {
    let lastColumn = row.length - 1;
    while (lastColumn >= 0 && !hasValue(row[lastColumn])) lastColumn -= 1;
    return Math.max(max, lastColumn + 1);
  }, 0);

  return {
    rows: activeRows.map((row) =>
      Array.from({ length: columnCount }, (_, index) => row[index] ?? null)
    ),
    startRow: firstRow + 1,
    columnCount,
  };
}

function suggestColumnMapping(rows, columnCount) {
  const normalizedHeaders = (rows[0] || []).map(normalizeHeader);
  const mapping = { delegatnummer: "", fullName: "", org: "" };
  for (const field of REQUIRED_COLUMNS) {
    const matchIndex = normalizedHeaders.findIndex((header) =>
      HEADER_ALIASES[field.key].includes(header)
    );
    if (matchIndex >= 0 && matchIndex < columnCount) mapping[field.key] = String(matchIndex);
  }
  return mapping;
}

function createRow(id, delegatnummer = "", fullName = "", org = "") {
  return { id, delegatnummer, fullName, org };
}

export default function CsvTool() {
  const [rows, setRows] = useState(() => {
    // Start with 5 empty rows, auto-numbered 1–5
    return Array.from({ length: 5 }, (_, i) =>
      createRow(i + 1, String(i + 1), "", "")
    );
  });
  const [globalError, setGlobalError] = useState("");
  const [excelFile, setExcelFile] = useState(null);
  const [excelFileName, setExcelFileName] = useState("");
  const [excelSheets, setExcelSheets] = useState([]);
  const [excelSheet, setExcelSheet] = useState("");
  const [excelRows, setExcelRows] = useState([]);
  const [excelStartRow, setExcelStartRow] = useState(1);
  const [excelColumnCount, setExcelColumnCount] = useState(0);
  const [excelMapping, setExcelMapping] = useState({ delegatnummer: "", fullName: "", org: "" });
  const [excelError, setExcelError] = useState("");
  const [excelStatus, setExcelStatus] = useState("");
  const [excelLoading, setExcelLoading] = useState(false);
  const nextIdRef = useRef(6);

  const loadExcelSheet = async (file, sheetName) => {
    setExcelLoading(true);
    setExcelError("");
    setExcelStatus("");
    try {
      const parsedRows = await readXlsxFile(file, { sheet: sheetName });
      const active = compactExcelRows(parsedRows);
      if (!active.rows.length) throw new Error("Arket inneholder ingen aktive celler.");
      if (active.rows.length > 10000 || active.columnCount > 200) {
        throw new Error("Arket er for stort. Maksimum er 10 000 aktive rader og 200 aktive kolonner.");
      }
      setExcelRows(active.rows);
      setExcelStartRow(active.startRow);
      setExcelColumnCount(active.columnCount);
      setExcelMapping(suggestColumnMapping(active.rows, active.columnCount));
    } catch (error) {
      console.error("[XLSX] parse error:", error);
      setExcelRows([]);
      setExcelColumnCount(0);
      setExcelError(error.message || "Kunne ikke lese Excel-filen.");
    } finally {
      setExcelLoading(false);
    }
  };

  const handleExcelUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setExcelError("");
    setExcelStatus("");

    if (!file.name.toLocaleLowerCase("no").endsWith(".xlsx")) {
      setExcelError("Velg en .xlsx-fil. Eldre .xls-filer må først lagres som .xlsx i Excel.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_EXCEL_FILE_SIZE) {
      setExcelError("Excel-filen kan ikke være større enn 10 MB.");
      event.target.value = "";
      return;
    }

    setExcelFile(file);
    setExcelFileName(file.name);
    setExcelLoading(true);
    try {
      const sheetNames = await readSheetNames(file);
      if (!sheetNames.length) throw new Error("Excel-filen inneholder ingen ark.");
      setExcelSheets(sheetNames);
      setExcelSheet(sheetNames[0]);
      await loadExcelSheet(file, sheetNames[0]);
    } catch (error) {
      console.error("[XLSX] workbook error:", error);
      setExcelError(error.message || "Kunne ikke åpne Excel-filen.");
      setExcelLoading(false);
    }
  };

  const handleSheetChange = async (event) => {
    const sheetName = event.target.value;
    setExcelSheet(sheetName);
    if (excelFile) await loadExcelSheet(excelFile, sheetName);
  };

  const importExcelRows = () => {
    setExcelStatus("");
    setExcelError("");
    if (!excelRows.length) return;
    if (REQUIRED_COLUMNS.some((field) => excelMapping[field.key] === "")) {
      setExcelError("Velg hvilken Excel-kolonne som skal brukes for alle tre CSV-feltene.");
      return;
    }

    const imported = excelRows
      .slice(1)
      .map((row) => ({
        delegatnummer: displayExcelValue(row[Number(excelMapping.delegatnummer)]).trim(),
        fullName: displayExcelValue(row[Number(excelMapping.fullName)]).trim(),
        org: displayExcelValue(row[Number(excelMapping.org)]).trim(),
      }))
      .filter((row) => row.delegatnummer || row.fullName || row.org)
      .map((row, index) => createRow(index + 1, row.delegatnummer, row.fullName, row.org));

    if (!imported.length) {
      setExcelError("Ingen deltakerrader ble funnet under overskriftsraden.");
      return;
    }

    setRows(imported);
    nextIdRef.current = imported.length + 1;
    setGlobalError("");
    setExcelStatus(`${imported.length} rader er lagt inn i CSV-verktøyet. Kontroller markerte feil før nedlasting.`);
  };

  const addRows = (count = 1) => {
    setRows((prev) => {
      const maxExisting = prev
        .map((r) => parseInt(r.delegatnummer, 10))
        .filter((n) => !Number.isNaN(n))
        .reduce((a, b) => Math.max(a, b), 0);
      const start = maxExisting || 0;
      const extra = Array.from({ length: count }, (_, idx) => {
        const rowNumber = start + idx + 1;
        const row = createRow(nextIdRef.current, String(rowNumber), "", "");
        nextIdRef.current += 1;
        return row;
      });
      return [...prev, ...extra];
    });
  };

  const clearAll = () => {
    if (!window.confirm("Vil du slette hele listen?")) return;
    setRows([createRow(1, "1", "", "")]);
    nextIdRef.current = 2;
  };

  const renumber = () => {
    setRows((prev) => {
      let counter = 1;
      return prev.map((r) => {
        const hasAny =
          (r.delegatnummer && String(r.delegatnummer).trim() !== "") ||
          (r.fullName && String(r.fullName).trim() !== "") ||
          (r.org && String(r.org).trim() !== "");
        if (!hasAny) {
          return { ...r, delegatnummer: "" };
        }
        const updated = { ...r, delegatnummer: String(counter) };
        counter += 1;
        return updated;
      });
    });
  };

  const updateCell = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const deleteRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const { displayRows, rowErrors, hasAnyErrors } = useMemo(() => {
    const trimmed = rows.map((r) => ({
      ...r,
      delegatnummer: String(r.delegatnummer ?? "").trim(),
      fullName: String(r.fullName ?? "").trim(),
      org: String(r.org ?? "").trim(),
    }));

    const active = trimmed.filter(
      (r) => r.delegatnummer || r.fullName || r.org
    );

    const errorsById = new Map();
    const numberCounts = new Map();

    for (const r of active) {
      const errs = [];
      if (!r.delegatnummer) errs.push("Mangler delegatnummer");
      if (!r.fullName) errs.push("Mangler fullt navn");
      if (!r.org) errs.push("Mangler råd/elevråd/organisasjon");

      const num = parseInt(r.delegatnummer, 10);
      if (r.delegatnummer && Number.isNaN(num)) {
        errs.push("Delegatnummer må være et heltall");
      }

      errorsById.set(r.id, errs);

      if (r.delegatnummer && !Number.isNaN(num)) {
        const key = String(num);
        numberCounts.set(key, (numberCounts.get(key) || 0) + 1);
      }
    }

    const duplicates = new Set(
      Array.from(numberCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([num]) => num)
    );

    for (const r of active) {
      const errs = errorsById.get(r.id) || [];
      if (
        r.delegatnummer &&
        duplicates.has(String(parseInt(r.delegatnummer, 10)))
      ) {
        errs.push("Delegatnummer er duplisert");
      }
      errorsById.set(r.id, errs);
    }

    const anyErrors = Array.from(errorsById.values()).some(
      (list) => list.length > 0
    );

    return {
      displayRows: trimmed,
      rowErrors: errorsById,
      hasAnyErrors: anyErrors,
    };
  }, [rows]);

  const handleDownload = () => {
    setGlobalError("");

    const active = displayRows.filter(
      (r) => r.delegatnummer || r.fullName || r.org
    );

    if (active.length === 0) {
      setGlobalError("Legg til minst én delegat før du laster ned.");
      return;
    }

    if (hasAnyErrors) {
      setGlobalError(
        "Noen rader har feil. Rett opp markerte rader før du laster ned."
      );
      return;
    }

    const headers = [
      "delegatnummer",
      "fullt navn",
      "representerer",
    ];

    const escapeVal = (v) => {
      const s = String(v ?? "");
      if (
        s.includes('"') ||
        s.includes(";") ||
        s.includes(",") ||
        s.includes("\n")
      ) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const lines = [];
    lines.push(headers.join(";"));
    for (const r of active) {
      const rowVals = [r.delegatnummer, r.fullName, r.org];
      lines.push(rowVals.map(escapeVal).join(";"));
    }

    const csvContent = lines.join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "delegater-talestolen.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

    return (
    <div className="page">
      <header className="header">
        <div className="nav-container">
          <div className="navigation-bar">
            <nav className="nav">
              <a className="btn nav" href="#admin">Admin</a>
              <a className="btn nav" href="#timer" target="talestolen-timer">Timer</a>
              <a className="btn nav" href="#queue" target="talestolen-queue">Taleliste</a>
            </nav>
            <nav className="nav-r">
              <a className="btn nav-r" href="#csv-verktoy" target="talestolen-csv">
                CSV Verktøy
              </a>
            </nav>
          </div>
          <img className="brand" src={`${import.meta.env.BASE_URL}TU-logov2.png`} alt="Telemark Ungdomsråd" />
        </div>

        <div className="header-space-container">
          <div className="header-space" />
        </div>
      </header>

      <div className="container">
        <section className="card main-card">
          <div className="title">CSV-verktøy for delegatliste</div>
          <p style={{ marginBottom: 8 }}>
            Fyll inn deltakerne under, så lager vi en CSV-fil som kan lastes opp i Talestolen.
          </p>
          <p className="muted" style={{ marginBottom: 16 }}>
            Kolonnene er <b>delegatnummer</b>, <b>fullt navn</b> og{" "}
            <b>råd/elevråd/organisasjon</b>.
          </p>

          <section className="excel-import-card" aria-labelledby="excel-import-title">
            <div className="title excel-import-title" id="excel-import-title">Importer fra Excel</div>
            <p>
              Last opp en <b>.xlsx-fil</b>. Verktøyet viser hele det aktive området i valgt ark,
              og lar deg velge hvilke kolonner som skal brukes i CSV-filen.
            </p>

            <div className="excel-upload-row">
              <input
                id="delegate-xlsx"
                className="csv-upload-input"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleExcelUpload}
              />
              <label className="csv-upload-button excel-upload-button" htmlFor="delegate-xlsx">
                Velg Excel-fil
              </label>
              <span className={`csv-file-name ${excelFileName ? "has-file" : ""}`}>
                {excelFileName || "Ingen fil valgt"}
              </span>
              {excelSheets.length > 1 && (
                <label className="excel-sheet-label">
                  Ark
                  <select className="input excel-sheet-select" value={excelSheet} onChange={handleSheetChange}>
                    {excelSheets.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
                  </select>
                </label>
              )}
            </div>

            {excelLoading && <p className="muted" role="status">Leser Excel-filen …</p>}
            {excelError && <p className="excel-message excel-message-error" role="alert">{excelError}</p>}
            {excelStatus && <p className="excel-message excel-message-success" role="status">{excelStatus}</p>}

            {excelRows.length > 0 && !excelLoading && (
              <>
                <div className="excel-summary">
                  Aktivt område: <b>{excelRows.length} rader</b> og <b>{excelColumnCount} kolonner</b>
                  {excelSheet ? <> i arket <b>{excelSheet}</b></> : null}.
                  Første aktive rad er Excel-rad {excelStartRow} og brukes som overskriftsrad.
                </div>

                <div className="excel-mapping" aria-label="Koble Excel-kolonner til CSV-felter">
                  {REQUIRED_COLUMNS.map((field) => (
                    <label key={field.key}>
                      CSV-felt: {field.label}
                      <select
                        className="input"
                        value={excelMapping[field.key]}
                        onChange={(event) => setExcelMapping((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))}
                      >
                        <option value="">Velg kolonne</option>
                        {Array.from({ length: excelColumnCount }, (_, columnIndex) => {
                          const header = displayExcelValue(excelRows[0]?.[columnIndex]).trim();
                          return (
                            <option key={columnIndex} value={String(columnIndex)}>
                              {excelColumnName(columnIndex)}{header ? ` – ${header}` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  ))}
                </div>

                <div className="excel-guidance">
                  <h3>Slik bør Excel-arket tilpasses</h3>
                  <ul>
                    <li>Bruk én overskriftsrad med kolonnene <b>delegatnummer</b>, <b>fullt navn</b> og <b>representerer</b>.</li>
                    <li>Ha én deltaker per rad. Fjern tittelrader, delsummer og sammenslåtte celler.</li>
                    <li>Delegatnummer må være unike heltall. Navn og organisasjon må være fylt ut.</li>
                    <li>Ekstra kolonner kan ligge i arket. De vises i forhåndsvisningen, men blir ikke med i CSV-filen.</li>
                  </ul>
                </div>

                <div className="excel-preview-wrap" tabIndex="0" aria-label="Forhåndsvisning av aktivt Excel-område">
                  <table className="excel-preview-table">
                    <thead>
                      <tr>
                        <th scope="col">Excel-rad</th>
                        {Array.from({ length: excelColumnCount }, (_, index) => (
                          <th scope="col" key={index}>{excelColumnName(index)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {excelRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className={rowIndex === 0 ? "excel-header-row" : undefined}>
                          <th scope="row">{excelStartRow + rowIndex}</th>
                          {Array.from({ length: excelColumnCount }, (_, columnIndex) => (
                            <td key={columnIndex}>{displayExcelValue(row[columnIndex])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button className="btn primary excel-use-button" type="button" onClick={importExcelRows}>
                  Bruk valgte kolonner i CSV-verktøyet
                </button>
              </>
            )}
          </section>

          <div className="row" style={{ marginBottom: 12, gap: 8 }}>
            <button className="btn" type="button" onClick={() => addRows(1)}>
              + Legg til rad
            </button>
            <button className="btn" type="button" onClick={() => addRows(10)}>
              + Legg til 10 rader
            </button>
            <button
              className="btn alternatives-btn"
              type="button"
              onClick={renumber}
            >
              Renummerer automatisk
            </button>
            <button
              className="btn alternatives-btn"
              type="button"
              onClick={clearAll}
            >
              Tøm hele listen
            </button>
          </div>

          {globalError && (
            <div style={{ color: "#B7173D", marginBottom: 10 }}>
              {globalError}
            </div>
          )}

          <div className="tableWrap">
            <table className="table csv-table">
              <thead>
                <tr>
                  <th style={{ width: "120px" }}>delegatnummer</th>
                  <th>fullt navn</th>
                  <th>råd/elevråd/organisasjon</th>
                  <th style={{ width: "60px" }}>Slett</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const errors = rowErrors.get(r.id) || [];
                  const hasError = errors.length > 0;
                  return (
                    <tr
                      key={r.id}
                      className={hasError ? "csv-row-error" : undefined}
                    >
                      <td>
                        <input
                          className="input input-delegatnummer"
                          type="text"
                          value={r.delegatnummer}
                          onChange={(e) =>
                            updateCell(r.id, "delegatnummer", e.target.value)
                          }
                          placeholder="1"
                        />
                      </td>
                      <td>
                        <input
                          className="input input-fullname"
                          type="text"
                          value={r.fullName}
                          onChange={(e) =>
                            updateCell(r.id, "fullName", e.target.value)
                          }
                          placeholder="Fornavn Etternavn"
                        />
                      </td>
                      <td>
                        <input
                          className="input input-org"
                          type="text"
                          value={r.org}
                          onChange={(e) =>
                            updateCell(r.id, "org", e.target.value)
                          }
                          placeholder="F.eks. Telemark ungdomsråd"
                        />
                      </td>
                      <td>
                        <button
                          className="btn delete-btn"
                          type="button"
                          onClick={() => deleteRow(r.id)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button className="btn primary" type="button" onClick={handleDownload}>
              Last ned CSV-fil
            </button>
            <span className="muted">
              Filen får navn <code>delegater-talestolen.csv</code>.
            </span>
          </div>
        </section>
      </div>
      <footer className="site-footer">
        <div className="footer-social">
          <div className="container">
            <div className="footer-social-row">
              <a href="https://www.facebook.com/telemarkfylkeskommune"
                title="Facebook - Telemark fylkeskommune"
                className="footer-social-btn footer-social-facebook"
                target="_blank" rel="noreferrer noopener">
                <span className="footer-social-icon">
                    <img src={`${import.meta.env.BASE_URL}f.png`} className="footer-social-img" alt="Facebook" />
                </span>

              </a>
              <a href="https://www.instagram.com/telemarkungdom/"
                title="Instagram - Telemark fylkeskommune"
                className="footer-social-btn footer-social-instagram"
                target="_blank" rel="noreferrer noopener">
                <span className="footer-social-icon">
                    <img src={`${import.meta.env.BASE_URL}ig.png`} className="footer-social-img" alt="Instagram" />
                </span>

              </a>
            </div>
          </div>
        </div>

        <div className="footer-main">
          <div className="container footer-main-grid">
            <div className="footer-col">
              <p><strong>Kontakt oss</strong></p>
              <p>Telemark Ungdomsråd<br/>Postboks 2844<br/>3702 Skien</p>
              <p>Koordinator for Telemark Ungdomsråd<br/><a href="mailto:heidi.bekkevold@telemarkfylke.no">heidi.bekkevold@telemarkfylke.no</a><br/>+47 991 55 531</p>
            </div>

            <div className="footer-col">
              <p><strong>Telemark Ungdomsråd</strong></p>
              <p><strong>Leder:</strong> Jan Sander Ravn Gudbrandsen<br/><a href="mailto:jan.sander.ravn.gudbrandsen@telemarkfylke.no">jan.sander.ravn.gudbrandsen@telemarkfylke.no</a><br/>+47 969 06 790</p>
              <p><strong>Nestleder:</strong> Helene Clausen Endresen<br/><a href="mailto:helene.c.endresen@gmail.com">helene.c.endresen@gmail.com</a><br/>+47 463 14 573</p>
              <p><strong>Nettsideutvikler:</strong> Sondre Callaerts<br/><a href="mailto:mrsoncal@gmail.com">mrsoncal@gmail.com</a><br/>+47 929 57 188</p>
            </div>

            <div className="footer-col">
              <p><strong></strong></p>
              <p></p>
            </div>

            <div className="footer-col footer-decoration">
              <svg xmlns="http://www.w3.org/2000/svg" width="158" height="243" viewBox="0 0 158 243" fill="none" aria-hidden="true">
                <path opacity="0.8" d="M79 81V161.985V162V243C35.3754 242.985 0.01422 206.729 0 162V81H79Z" fill="white"></path>
                <path opacity="0.4" d="M79 162C79.0063 117.264 114.362 81 157.974 81C157.983 81 157.991 81 158 81V162H79Z" fill="white"></path>
                <path opacity="0.6" d="M158 243C157.994 198.264 122.638 162 79.0261 162C79.0174 162 79.0087 162 79 162V243H158Z" fill="white"></path>
                <rect opacity="0.8" x="79" width="79" height="81" fill="white"></rect>
              </svg>
            </div>
          </div>

          <div className="container footer-bottom">
            <div className="footer-logo-block">
              <img src={`${import.meta.env.BASE_URL}TU-logo-bw-wide.png`} alt="Telemark Ungdomsråd" className="footer-logo" />
            </div>
            <ul className="footer-links">
              <p>© Sondre Callaerts — Frigitt til fri bruk</p>
              <li className="footer-links-badge">
                <a href="https://www.telemarkfylke.no/link/22cdc346a84a49e5add33a4198ce23ed.aspx" target="_blank" rel="noreferrer noopener">
                  <img src="https://www.telemarkfylke.no/globalassets/Administrasjon/tfk/system/layout/miljofyrtaarn-logo-svart.svg" alt="Miljøfyrtårn logo" />
                </a>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
