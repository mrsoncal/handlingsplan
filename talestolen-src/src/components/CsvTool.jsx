import React, { useMemo, useState, useRef } from "react";
import readXlsxFile, { readSheetNames } from "read-excel-file";
import { loadDelegates, saveDelegatesToLocalStorageRaw } from "../store/bus.js";
import {
  REQUIRED_COLUMNS,
  buildImportedRows,
  compactExcelRows,
  createParticipantRow,
  displayExcelValue,
  excelColumnName,
  makeCsvContent,
  suggestColumnMapping,
  suggestHeaderRow,
  validateParticipantRows,
} from "../utils/excelImport.js";

const MAX_EXCEL_FILE_SIZE = 10 * 1024 * 1024;

function downloadCsvFile(rows) {
  const csvContent = makeCsvContent(rows);
  const blob = new Blob(["\ufeff", csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "delegater-talestolen.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function CsvTool() {
  const [rows, setRows] = useState(() => {
    // Start with 5 empty rows, auto-numbered 1–5
    return Array.from({ length: 5 }, (_, i) =>
      createParticipantRow(i + 1, String(i + 1), "", "")
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
  const [excelHeaderIndex, setExcelHeaderIndex] = useState(0);
  const [excelMapping, setExcelMapping] = useState({ delegatnummer: "", fullName: "", orgColumns: [] });
  const [assignMissingNumbers, setAssignMissingNumbers] = useState(true);
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
      const suggestedHeaderIndex = suggestHeaderRow(active.rows);
      const suggestedMapping = suggestColumnMapping(active.rows, active.columnCount, suggestedHeaderIndex);
      const imported = buildImportedRows({
        rows: active.rows,
        headerIndex: suggestedHeaderIndex,
        mapping: suggestedMapping,
        assignMissingNumbers,
      }).map((row, index) => ({ ...row, id: index + 1 }));
      setExcelHeaderIndex(suggestedHeaderIndex);
      setExcelMapping(suggestedMapping);
      setRows(imported);
      nextIdRef.current = imported.length + 1;
      setGlobalError("");
      setExcelStatus(`${imported.length} deltakere er lagt i deltakerlisten.`);
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

  const handleHeaderRowChange = (event) => {
    const nextHeaderIndex = Number(event.target.value);
    setExcelHeaderIndex(nextHeaderIndex);
    setExcelMapping(suggestColumnMapping(excelRows, excelColumnCount, nextHeaderIndex));
    setExcelStatus("");
    setExcelError("");
  };

  const updateOrgColumn = (position, value) => {
    setExcelMapping((current) => {
      const nextColumns = [...current.orgColumns];
      nextColumns[position] = value;
      return { ...current, orgColumns: nextColumns.filter((column) => column !== "") };
    });
  };

  const addOrgColumn = () => {
    setExcelMapping((current) => ({
      ...current,
      orgColumns: [...current.orgColumns, ""],
    }));
  };

  const removeOrgColumn = (position) => {
    setExcelMapping((current) => ({
      ...current,
      orgColumns: current.orgColumns.filter((_, index) => index !== position),
    }));
  };

  const excelImportPreview = useMemo(() => {
    if (!excelRows.length) return [];
    return buildImportedRows({
      rows: excelRows,
      headerIndex: excelHeaderIndex,
      mapping: excelMapping,
      assignMissingNumbers,
    });
  }, [excelRows, excelHeaderIndex, excelMapping, assignMissingNumbers]);

  const importExcelRows = () => {
    setExcelStatus("");
    setExcelError("");
    if (!excelRows.length) return;
    if (
      excelMapping.delegatnummer === "" ||
      excelMapping.fullName === "" ||
      excelMapping.orgColumns.length === 0
    ) {
      setExcelError("Velg kolonner for delegatnummer, fullt navn og hvem deltakeren representerer.");
      return;
    }

    const imported = excelImportPreview.map((row, index) => ({ ...row, id: index + 1 }));

    if (!imported.length) {
      setExcelError("Ingen deltakerrader ble funnet under overskriftsraden.");
      return;
    }

    setRows(imported);
    nextIdRef.current = imported.length + 1;
    setGlobalError("");
    setExcelStatus(`${imported.length} deltakere er lagt i radeditoren. Kontroller eventuelle feil nedenfor.`);
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
        const row = createParticipantRow(nextIdRef.current, String(rowNumber), "", "");
        nextIdRef.current += 1;
        return row;
      });
      return [...prev, ...extra];
    });
  };

  const clearAll = () => {
    if (!window.confirm("Vil du slette hele listen?")) return;
    setRows([createParticipantRow(1, "1", "", "")]);
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

  const rowValidation = useMemo(() => validateParticipantRows(rows), [rows]);
  const displayRows = rowValidation.normalized;
  const rowErrors = rowValidation.errorsById;
  const hasAnyErrors = rowValidation.hasAnyErrors;

  const handleDownload = () => {
    setGlobalError("");

    const active = rowValidation.active;

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

    downloadCsvFile(active);
  };

  const useEditedRowsInTalestolen = () => {
    setGlobalError("");
    if (!rowValidation.active.length) {
      setGlobalError("Legg til minst én delegat først.");
      return;
    }
    if (rowValidation.hasAnyErrors) {
      setGlobalError("Rett opp feilene som står under de markerte radene.");
      return;
    }
    const csvContent = makeCsvContent(rowValidation.active);
    loadDelegates(
      rowValidation.active.map((row) => ({
        number: row.delegatnummer,
        name: row.fullName,
        org: row.org,
      }))
    );
    saveDelegatesToLocalStorageRaw(csvContent);
    window.location.hash = "#admin";
  };

  const mappingIsComplete =
    excelMapping.delegatnummer !== "" &&
    excelMapping.fullName !== "" &&
    excelMapping.orgColumns.length > 0;
  const excelColumnOptions = Array.from({ length: excelColumnCount }, (_, columnIndex) => {
    const header = displayExcelValue(excelRows[excelHeaderIndex]?.[columnIndex]).trim();
    return { value: String(columnIndex), label: `${excelColumnName(columnIndex)}${header ? ` – ${header}` : ""}` };
  });
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
          <div className="title">Importer deltakere</div>

          <section className="excel-import-card" aria-labelledby="excel-import-title">
            <div className="title excel-import-title" id="excel-import-title">Last opp Excel-fil</div>
            <p>
              Velg en <b>.xlsx-fil</b> fra påmeldingssystemet.
            </p>

            <label className="excel-auto-number">
              <input
                type="checkbox"
                checked={assignMissingNumbers}
                onChange={(event) => setAssignMissingNumbers(event.target.checked)}
              />
              <span>Tildel manglende delegatnumre automatisk</span>
            </label>

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
              <details className="excel-mapping-details">
                <summary>Juster kolonner</summary>
                <div className="excel-mapping-heading">
                  <h3>Kolonner</h3>
                  <p>Kolonnene er valgt automatisk. Endre dem bare hvis deltakerlisten ser feil ut.</p>
                </div>

                <div className="excel-mapping" aria-label="Koble Excel-kolonner til deltakerfelter">
                  <label>
                    Overskriftsrad
                    <select className="input" value={excelHeaderIndex} onChange={handleHeaderRowChange}>
                      {excelRows.slice(0, 10).map((row, index) => (
                        <option key={index} value={index}>
                          Excel-rad {excelStartRow + index} ({row.filter((value) => displayExcelValue(value).trim()).length} utfylte celler)
                        </option>
                      ))}
                    </select>
                  </label>
                  {REQUIRED_COLUMNS.filter((field) => field.key !== "org").map((field) => (
                    <label key={field.key}>
                      {field.label}
                      <select
                        className="input"
                        value={excelMapping[field.key]}
                        onChange={(event) => setExcelMapping((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))}
                      >
                        <option value="">Velg kolonne</option>
                        {excelColumnOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                <fieldset className="excel-org-mapping">
                  <legend>Hvem deltakeren representerer</legend>
                  <p className="muted">Vi bruker den første utfylte verdien, ovenfra og ned.</p>
                  {excelMapping.orgColumns.map((column, position) => (
                    <div className="excel-org-row" key={`${position}-${column}`}>
                      <span className="excel-priority">{position + 1}</span>
                      <select
                        className="input"
                        aria-label={`Representasjon, prioritet ${position + 1}`}
                        value={column}
                        onChange={(event) => updateOrgColumn(position, event.target.value)}
                      >
                        <option value="">Velg kolonne</option>
                        {excelColumnOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn excel-remove-column"
                        aria-label={`Fjern reservekolonne ${position + 1}`}
                        onClick={() => removeOrgColumn(position)}
                      >
                        Fjern
                      </button>
                    </div>
                  ))}
                  <button className="btn excel-add-column" type="button" onClick={addOrgColumn}>
                    + Legg til reservekolonne
                  </button>
                </fieldset>

                <button className="btn primary excel-use-button" type="button" onClick={importExcelRows} disabled={!mappingIsComplete}>
                  Oppdater deltakerlisten
                </button>
              </details>
            )}
          </section>

          <div className="manual-editor-heading">
            <h2>Deltakerliste</h2>
          </div>

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
              Nummerer alle på nytt
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
                {rows.map((r, rowIndex) => {
                  const errors = rowErrors.get(r.id) || [];
                  const hasError = errors.length > 0;
                  const errorId = `csv-row-errors-${r.id}`;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={hasError ? "csv-row-error" : undefined}>
                        <td>
                          <input
                            className="input input-delegatnummer"
                            type="text"
                            inputMode="numeric"
                            value={r.delegatnummer}
                            aria-label={`Delegatnummer, rad ${rowIndex + 1}`}
                            aria-invalid={hasError || undefined}
                            aria-describedby={hasError ? errorId : undefined}
                            onChange={(e) => updateCell(r.id, "delegatnummer", e.target.value)}
                            placeholder="1"
                          />
                        </td>
                        <td>
                          <input
                            className="input input-fullname"
                            type="text"
                            value={r.fullName}
                            aria-label={`Fullt navn, rad ${rowIndex + 1}`}
                            aria-invalid={hasError || undefined}
                            aria-describedby={hasError ? errorId : undefined}
                            onChange={(e) => updateCell(r.id, "fullName", e.target.value)}
                            placeholder="Fornavn Etternavn"
                          />
                        </td>
                        <td>
                          <input
                            className="input input-org"
                            type="text"
                            value={r.org}
                            aria-label={`Representerer, rad ${rowIndex + 1}`}
                            aria-invalid={hasError || undefined}
                            aria-describedby={hasError ? errorId : undefined}
                            onChange={(e) => updateCell(r.id, "org", e.target.value)}
                            placeholder="F.eks. Telemark ungdomsråd"
                          />
                        </td>
                        <td>
                          <button
                            className="btn delete-btn"
                            type="button"
                            aria-label={`Slett rad ${rowIndex + 1}${r.fullName ? `: ${r.fullName}` : ""}`}
                            title="Slett rad"
                            onClick={() => deleteRow(r.id)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                      {hasError && (
                        <tr className="csv-row-error-message">
                          <td colSpan="4">
                            <ul id={errorId}>
                              {errors.map((error) => <li key={error}>{error}</li>)}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
            <button className="btn primary" type="button" onClick={useEditedRowsInTalestolen}>
              Bruk i Talestolen
            </button>
            <button className="btn" type="button" onClick={handleDownload}>
              Last ned CSV-fil
            </button>
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
