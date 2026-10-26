import React, { useCallback, useMemo, useState, useRef } from "react";
import readXlsxFile, { readSheetNames } from "read-excel-file";
import { loadDelegates, saveDelegatesToLocalStorageRaw } from "../store/bus.js";
import AppNavigation from "./AppNavigation.jsx";
import SiteFooter from "./SiteFooter.jsx";
import CsvTutorial from "./CsvTutorial.jsx";
import ColumnDropdown from "./ColumnDropdown.jsx";
import { TutorialIntro } from "./Tutorial.jsx";
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

export default function CsvTool({ delegateSaveError = "" }) {
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
  const [showTutorial, setShowTutorial] = useState(false);
  const [showTutorialIntro, setShowTutorialIntro] = useState(() => {
    try { return localStorage.getItem("csv_tutorial_intro_dismissed_v1") !== "1"; }
    catch { return true; }
  });
  const [tutorialDemoLoaded, setTutorialDemoLoaded] = useState(false);
  const [tutorialMappingOpen, setTutorialMappingOpen] = useState(false);
  const [tutorialMappingApplied, setTutorialMappingApplied] = useState(false);
  const tutorialSnapshotRef = useRef(null);
  const tutorialLoadRef = useRef(0);
  const nextIdRef = useRef(6);

  const loadExcelSheet = async (file, sheetName, { tutorialDemo = false, isCurrent = () => true } = {}) => {
    setExcelLoading(true);
    setExcelError("");
    setExcelStatus("");
    try {
      const parsedRows = await readXlsxFile(file, { sheet: sheetName });
      if (!isCurrent()) return false;
      const active = compactExcelRows(parsedRows);
      if (!active.rows.length) throw new Error("Arket inneholder ingen aktive celler.");
      if (active.rows.length > 10000 || active.columnCount > 200) {
        throw new Error("Arket er for stort. Maksimum er 10 000 aktive rader og 200 aktive kolonner.");
      }
      const suggestedHeaderIndex = suggestHeaderRow(active.rows);
      // A tutorial should stay small even if its example workbook grows later.
      const sourceRows = tutorialDemo ? active.rows.slice(0, suggestedHeaderIndex + 11) : active.rows;
      setExcelRows(sourceRows);
      setExcelStartRow(active.startRow);
      setExcelColumnCount(active.columnCount);
      const automaticMapping = suggestColumnMapping(active.rows, active.columnCount, suggestedHeaderIndex);
      // Leave the VGS column for the user to add during the guided exercise.
      const suggestedMapping = tutorialDemo
        ? { ...automaticMapping, orgColumns: automaticMapping.orgColumns.slice(0, 1) }
        : automaticMapping;
      if (tutorialDemo) setAssignMissingNumbers(true);
      const imported = buildImportedRows({
        rows: sourceRows,
        headerIndex: suggestedHeaderIndex,
        mapping: suggestedMapping,
        assignMissingNumbers: tutorialDemo || assignMissingNumbers,
      }).map((row, index) => ({ ...row, id: index + 1 }));
      setExcelHeaderIndex(suggestedHeaderIndex);
      setExcelMapping(suggestedMapping);
      setRows(imported);
      nextIdRef.current = imported.length + 1;
      setGlobalError("");
      setExcelStatus(`${imported.length} deltakere er lagt i deltakerlisten.`);
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      console.error("[XLSX] parse error:", error);
      setExcelRows([]);
      setExcelColumnCount(0);
      setExcelError(error.message || "Kunne ikke lese Excel-filen.");
      return false;
    } finally {
      if (isCurrent()) setExcelLoading(false);
    }
  };

  const loadExcelWorkbook = async (file, options = {}) => {
    setExcelFile(file);
    setExcelFileName(file.name);
    setExcelLoading(true);
    try {
      const sheetNames = await readSheetNames(file);
      if (options.isCurrent && !options.isCurrent()) return false;
      if (!sheetNames.length) throw new Error("Excel-filen inneholder ingen ark.");
      setExcelSheets(sheetNames);
      setExcelSheet(sheetNames[0]);
      return await loadExcelSheet(file, sheetNames[0], options);
    } catch (error) {
      if (options.isCurrent && !options.isCurrent()) return false;
      console.error("[XLSX] workbook error:", error);
      setExcelError(error.message || "Kunne ikke åpne Excel-filen.");
      setExcelLoading(false);
      return false;
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

    await loadExcelWorkbook(file);
  };

  const loadTutorialDemo = async () => {
    const loadId = ++tutorialLoadRef.current;
    const isCurrent = () => tutorialLoadRef.current === loadId && tutorialSnapshotRef.current !== null;
    setExcelError("");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}demo-paamelding.xlsx?v=2`);
      if (!isCurrent()) return false;
      if (!response.ok) throw new Error("Demoarket kunne ikke hentes.");
      const file = new File([await response.blob()], "demo-paamelding.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      if (!isCurrent()) return false;
      const loaded = await loadExcelWorkbook(file, { tutorialDemo: true, isCurrent });
      if (loaded && isCurrent()) setTutorialDemoLoaded(true);
      return loaded;
    } catch (error) {
      if (isCurrent()) setExcelError(error.message || "Demoarket kunne ikke åpnes.");
      return false;
    }
  };

  const openTutorial = () => {
    tutorialLoadRef.current += 1;
    dismissTutorialIntro();
    tutorialSnapshotRef.current = {
      rows, globalError, excelFile, excelFileName, excelSheets, excelSheet,
      excelRows, excelStartRow, excelColumnCount, excelHeaderIndex, excelMapping,
      assignMissingNumbers, excelError, excelStatus, nextId: nextIdRef.current,
      detailsOpen: Boolean(document.querySelector(".excel-mapping-details")?.open),
    };
    const details = document.querySelector(".excel-mapping-details");
    if (details) details.open = false;
    setTutorialDemoLoaded(false);
    setTutorialMappingOpen(false);
    setTutorialMappingApplied(false);
    setShowTutorial(true);
  };

  const dismissTutorialIntro = useCallback(() => {
    try { localStorage.setItem("csv_tutorial_intro_dismissed_v1", "1"); } catch {}
    setShowTutorialIntro(false);
  }, []);

  const closeTutorial = useCallback(() => {
    tutorialLoadRef.current += 1;
    const saved = tutorialSnapshotRef.current;
    if (saved) {
      setRows(saved.rows);
      setGlobalError(saved.globalError);
      setExcelFile(saved.excelFile);
      setExcelFileName(saved.excelFileName);
      setExcelSheets(saved.excelSheets);
      setExcelSheet(saved.excelSheet);
      setExcelRows(saved.excelRows);
      setExcelStartRow(saved.excelStartRow);
      setExcelColumnCount(saved.excelColumnCount);
      setExcelHeaderIndex(saved.excelHeaderIndex);
      setExcelMapping(saved.excelMapping);
      setAssignMissingNumbers(saved.assignMissingNumbers);
      setExcelError(saved.excelError);
      setExcelStatus(saved.excelStatus);
      nextIdRef.current = saved.nextId;
      const details = document.querySelector(".excel-mapping-details");
      if (details) details.open = saved.detailsOpen;
    }
    tutorialSnapshotRef.current = null;
    setShowTutorial(false);
  }, []);

  const handleSheetChange = async (event) => {
    const sheetName = event.target.value;
    setExcelSheet(sheetName);
    if (excelFile) await loadExcelSheet(excelFile, sheetName);
  };

  const handleHeaderRowChange = (value) => {
    const nextHeaderIndex = Number(value);
    setExcelHeaderIndex(nextHeaderIndex);
    setExcelMapping(suggestColumnMapping(excelRows, excelColumnCount, nextHeaderIndex));
    setExcelStatus("");
    setExcelError("");
    setTutorialMappingApplied(false);
  };

  const updateOrgColumn = (position, value) => {
    setTutorialMappingApplied(false);
    setExcelMapping((current) => {
      const nextColumns = [...current.orgColumns];
      nextColumns[position] = value;
      return { ...current, orgColumns: nextColumns.filter((column) => column !== "") };
    });
  };

  const addOrgColumn = () => {
    setTutorialMappingApplied(false);
    setExcelMapping((current) => ({
      ...current,
      orgColumns: [...current.orgColumns, ""],
    }));
  };

  const removeOrgColumn = (position) => {
    setTutorialMappingApplied(false);
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
    if (showTutorial) setTutorialMappingApplied(true);
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
      <AppNavigation active="import" />
      {delegateSaveError && <p className="delegate-save-error" role="alert">{delegateSaveError}</p>}

      <div className="container">
        <section className="card main-card">
          <div className="csv-tool-heading">
            <div className="title">Importer deltakere</div>
            <button type="button" className="tutorial-trigger" onClick={openTutorial} aria-label="Vis veiledning for CSV-verktøyet" title="Slik bruker du CSV-verktøyet">?</button>
          </div>

          <section className="excel-import-card" aria-labelledby="excel-import-title" data-csv-tutorial="upload">
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
              <details className="excel-mapping-details" onToggle={(event) => setTutorialMappingOpen(event.currentTarget.open)}>
                <summary data-csv-tutorial="mapping-toggle">Juster kolonner</summary>
                <div className="excel-mapping-heading">
                  <h3>Kolonner</h3>
                  <p>Kolonnene er valgt automatisk. Endre dem bare hvis deltakerlisten ser feil ut.</p>
                </div>

                <div className="excel-mapping" aria-label="Koble Excel-kolonner til deltakerfelter" data-csv-tutorial="columns">
                  <ColumnDropdown
                    label="Overskriftsrad"
                    value={excelHeaderIndex}
                    options={excelRows.slice(0, 10).map((row, index) => ({
                      value: String(index),
                      label: `Excel-rad ${excelStartRow + index} (${row.filter((cell) => displayExcelValue(cell).trim()).length} utfylte celler)`,
                    }))}
                    onChange={handleHeaderRowChange}
                  />
                  {REQUIRED_COLUMNS.filter((field) => field.key !== "org").map((field) => (
                    <ColumnDropdown
                      key={field.key}
                      label={field.label}
                      value={excelMapping[field.key]}
                      options={[{ value: "", label: "Velg kolonne" }, ...excelColumnOptions]}
                      onChange={(nextValue) => {
                          setTutorialMappingApplied(false);
                          setExcelMapping((current) => ({ ...current, [field.key]: nextValue }));
                        }}
                    />
                  ))}
                </div>

                <fieldset className="excel-org-mapping" data-csv-tutorial="representation">
                  <legend>Hvem deltakeren representerer</legend>
                  <p className="muted">Vi bruker den første utfylte verdien, ovenfra og ned.</p>
                  {excelMapping.orgColumns.map((column, position) => (
                    <div className="excel-org-row" key={position}>
                      <span className="excel-priority">{position + 1}</span>
                      <ColumnDropdown
                        label={`Representasjon, prioritet ${position + 1}`}
                        className="excel-org-dropdown"
                        value={column}
                        options={[{ value: "", label: "Velg kolonne" }, ...excelColumnOptions]}
                        onChange={(nextValue) => updateOrgColumn(position, nextValue)}
                      />
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

                <button className="btn primary excel-use-button" type="button" onClick={importExcelRows} disabled={!mappingIsComplete} data-csv-tutorial="apply">
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

          <div className="tableWrap" data-csv-tutorial="editor">
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
                  const numberError = errors.some((error) => /delegatnummer/i.test(error));
                  const nameError = errors.some((error) => /fullt navn/i.test(error));
                  const orgError = errors.some((error) => /representerer/i.test(error));
                  return (
                      <tr key={r.id} className={hasError ? "csv-row-error" : undefined}>
                        <td>
                          <input
                            className="input input-delegatnummer"
                            type="text"
                            inputMode="numeric"
                            value={r.delegatnummer}
                            aria-label={`Delegatnummer, rad ${rowIndex + 1}`}
                            aria-invalid={numberError || undefined}
                            aria-describedby={numberError ? errorId : undefined}
                            onChange={(e) => updateCell(r.id, "delegatnummer", e.target.value)}
                            placeholder="1"
                          />
                          {hasError && <span className="csv-sr-only" id={errorId}>{errors.join(". ")}</span>}
                        </td>
                        <td>
                          <input
                            className="input input-fullname"
                            type="text"
                            value={r.fullName}
                            aria-label={`Fullt navn, rad ${rowIndex + 1}`}
                            aria-invalid={nameError || undefined}
                            aria-describedby={nameError ? errorId : undefined}
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
                            aria-invalid={orgError || undefined}
                            aria-describedby={orgError ? errorId : undefined}
                            data-csv-tutorial={showTutorial && r.fullName === "Hedda Eksempel" ? "fix" : undefined}
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
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            data-csv-tutorial="actions"
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button className="btn primary" type="button" onClick={useEditedRowsInTalestolen} disabled={showTutorial}>
              Bruk i Talestolen
            </button>
            <button className="btn" type="button" onClick={handleDownload} disabled={showTutorial}>
              Last ned CSV-fil
            </button>
          </div>
        </section>
      </div>
      <SiteFooter />
      {showTutorialIntro && !showTutorial && <TutorialIntro
        onDismiss={dismissTutorialIntro}
        title="Ny i CSV-verktøyet?"
        description="Trykk på spørsmålstegnet for en praktisk veiledning i Excel-import, kolonnevalg og ferdig deltakerliste."
      />}
      {showTutorial && <CsvTutorial
        onClose={closeTutorial}
        onLoadDemo={loadTutorialDemo}
        demoLoaded={tutorialDemoLoaded}
        demoLoading={excelLoading}
        demoError={excelError}
        mappingOpen={tutorialMappingOpen}
        orgMapped={excelMapping.orgColumns.includes("4")}
        mappingApplied={tutorialMappingApplied}
        rowsValid={tutorialMappingApplied && !hasAnyErrors && rowValidation.active.length === 8}
        csvPreview={makeCsvContent(rowValidation.active)}
      />}
    </div>
  );
}
