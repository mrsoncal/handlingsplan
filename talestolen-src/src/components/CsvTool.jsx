import React, { useMemo, useState } from "react";

/** Detect delimiter by frequency */
function detectDelimiter(line = "") {
  const counts = { ",": (line.match(/,/g) || []).length,
                   ";": (line.match(/;/g) || []).length,
                   "\t": (line.match(/\t/g) || []).length };
  return Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0] || ",";
}

/** Normalize headers and rows to {nr, navn, representerer} */
function normalizeRows(rows) {
  if (!rows || rows.length === 0) return [];
  const header = rows[0].map(h => String(h || "").trim().toLowerCase());
  const findIdx = (cands) => header.findIndex(h => cands.includes(h));
  const iNr  = findIdx(["nr", "number", "delegatenummer", "delegate number", "delegatenr", "id"]);
  const iNavn = findIdx(["navn", "name"]);
  const iOrg = findIdx(["representerer", "org", "organisasjon", "kommune", "hvem du representerer", "representant", "org.", "organisation", "organization"]);

  const body = rows.slice(1);
  return body.map(r => ({
    nr:  (r[iNr]  ?? "").toString().trim(),
    navn:(r[iNavn]?? "").toString().trim(),
    representerer:(r[iOrg] ?? "").toString().trim()
  })).filter(r => r.nr || r.navn || r.representerer);
}

/** Build CSV text from normalized rows */
function toCSV(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const head = ["nr","navn","representerer"];
  const lines = [head, ...rows.map(r => [r.nr, r.navn, r.representerer])];
  return lines.map(r => r.map(esc).join(",")).join("\n");
}

export default function CsvTool() {
  const [data, setData] = useState([]);       // normalized rows
  const [error, setError] = useState("");

  async function handleFile(e) {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split(".").pop();

    try {
      if (ext === "csv" || ext === "tsv") {
        // Parse CSV/TSV in-browser
        const text = await file.text();
        const firstLine = text.split(/\r?\n/).find(Boolean) || "";
        const delim = ext === "tsv" ? "\t" : detectDelimiter(firstLine);
        const rows = text.split(/\r?\n/).filter(Boolean).map(line => {
          const parts = [];
          let cur = "", q = false;
          for (let i=0;i<line.length;i++){
            const ch = line[i];
            if (ch === '"') {
              if (q && line[i+1] === '"') { cur += '"'; i++; } else q = !q;
            } else if (ch === delim && !q) { parts.push(cur); cur=""; }
            else { cur += ch; }
          }
          parts.push(cur);
          return parts;
        });
        setData(normalizeRows(rows));
      } else if (ext === "xlsx" || ext === "xls") {
        // Lightweight XLSX support via CDN ESM import (no bundler change needed)
        const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        setData(normalizeRows(rows));
      } else {
        setError("Ukjent filtype. Last opp CSV, TSV, XLSX eller XLS.");
      }
    } catch (err) {
      console.error(err);
      setError("Kunne ikke lese filen. Sjekk formatet og prøv igjen.");
    }
  }

  function downloadCSV() {
    const csv = toCSV(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "delegater.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const ready = data.length > 0;

  return (
    <div className="container">
      <section className="card main-card">
        <div className="title">CSV verktøy</div>

        <div className="row">
          <input className="input" type="file" accept=".csv,.tsv,.xlsx,.xls" onChange={handleFile} />
          <button className="btn" onClick={downloadCSV} disabled={!ready}>
            Eksporter som CSV
          </button>
        </div>

        {error ? <div className="muted" style={{color:"#B7173D", marginTop:8}}>{error}</div> : null}

        {!ready ? (
          <div className="muted" style={{ marginTop: 10 }}>
            Last opp et regneark (CSV/TSV/XLSX/XLS). Verktøyet normaliserer til kolonnene <b>nr</b>, <b>navn</b>, <b>representerer</b>.
          </div>
        ) : (
          <div className="tableWrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr><th>nr</th><th>navn</th><th>representerer</th></tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={i}>
                    <td>{r.nr}</td>
                    <td>{r.navn}</td>
                    <td>{r.representerer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
