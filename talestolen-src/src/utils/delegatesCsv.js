export function parseCSV(text) {
  if (!text) return [];
  let s = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const lines = s.split("\n").filter(Boolean);
  if (!lines.length) return [];

  const delim = detectDelimiter(lines[0]);
  const split = (line) => splitRow(line, delim);
  const sample = lines[0];
  const hasHeader = /[A-Za-z]/.test(sample.split(delim)[0]) && /[A-Za-z]/.test(sample);

  const rows = [];
  if (hasHeader) {
    const headers = split(lines[0]).map((h) => h.trim().toLowerCase());
    for (let i = 1; i < lines.length; i++) {
      const cells = split(lines[i]);
      const row = {};
      headers.forEach((h, idx) => (row[h] = (cells[idx] ?? "").trim()));
      rows.push(normalizeRow(row));
    }
  } else {
    for (const line of lines) {
      const [number = "", name = "", org = ""] = split(line).map((x) => (x ?? "").trim());
      rows.push({ number, name, org });
    }
  }
  return rows.filter((r) => String(r.number || "").trim() !== "");
}

export function readDelegatesCsvFile(file, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    reader.onload = () => {
      try {
        onProgress?.(100);
        resolve({ text: String(reader.result || ""), rows: parseCSV(reader.result) });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error || new Error("CSV-filen kunne ikke leses."));
    reader.readAsText(file, "utf-8");
  });
}

function detectDelimiter(line) {
  const counts = {
    ",": (line.match(/,/g) || []).length,
    ";": (line.match(/;/g) || []).length,
    "\t": (line.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ",";
}

function splitRow(line, delim) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function normalizeRow(row) {
  const get = (keys) => {
    for (const key of keys) {
      const value = row[key];
      if (value != null && String(value).trim() !== "") return String(value).trim();
    }
    return "";
  };
  return {
    number: get(["number", "nr", "delegatenummer", "delegatnummer", "delegate number", "delegatenr", "id"]),
    name: get(["name", "navn", "fullt navn"]),
    org: get(["org", "organisasjon", "kommune", "representerer", "org.", "råd/eleråd/organisasjon"]),
  };
}
