import React, { useMemo, useState, useRef } from "react";

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
  const nextIdRef = useRef(6);

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
          <img class="brand" src="../TU-logov2.png" alt="Telemark Ungdomsråd" />
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
                    <img src="../f.png" className="footer-social-img" />
                </span>

              </a>
              <a href="https://www.instagram.com/telemarkungdom/"
                title="Instagram - Telemark fylkeskommune"
                className="footer-social-btn footer-social-instagram"
                target="_blank" rel="noreferrer noopener">
                <span className="footer-social-icon">
                    <img src="../ig.png" className="footer-social-img" />
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
              <img src="../TU-logo-bw-wide.png" alt="Telemark Ungdomsråd" class="footer-logo" />
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
