export const REQUIRED_COLUMNS = [
  { key: "delegatnummer", label: "delegatnummer" },
  { key: "fullName", label: "fullt navn" },
  { key: "org", label: "representerer" },
];

export function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("no")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function excelColumnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

export function displayExcelValue(value) {
  if (value instanceof Date) return value.toLocaleDateString("nb-NO");
  if (value == null) return "";
  return String(value);
}

export function formatRepresentation(value, sourceHeader) {
  const text = displayExcelValue(value).trim();
  if (!text) return "";

  const header = normalizeHeader(sourceHeader);
  const normalizedValue = normalizeHeader(text);
  const sourceTypes = [
    header.includes("ungdomsrad") ? "ungdomsrad" : "",
    header.includes("elevrad") ? "elevrad" : "",
    header.includes("vgs") || header.includes("videregaende") ? "vgs" : "",
    header.includes("organisasjon") ? "organisasjon" : "",
  ].filter(Boolean);

  // Combined columns such as "råd/elevråd/organisasjon" already contain mixed data.
  if (sourceTypes.length !== 1) return text;

  if (sourceTypes[0] === "ungdomsrad" && !normalizedValue.includes("ungdomsrad")) {
    return `${text} ungdomsråd`;
  }
  if (
    sourceTypes[0] === "vgs" &&
    !normalizedValue.includes("vgs") &&
    !normalizedValue.includes("videregaende")
  ) {
    return `${text} VGS`;
  }
  if (sourceTypes[0] === "elevrad" && !normalizedValue.includes("elevrad")) {
    return `${text} elevråd`;
  }
  return text;
}

export function compactExcelRows(rows) {
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

function populatedCount(rows, columnIndex, headerIndex) {
  return rows
    .slice(headerIndex + 1)
    .reduce((count, row) => count + (displayExcelValue(row[columnIndex]).trim() ? 1 : 0), 0);
}

function headerScoreForRow(row) {
  const headers = row.map(normalizeHeader);
  const populated = headers.filter(Boolean).length;
  const relevant = headers.filter((header) =>
    /(delegat|navn|name|represent|organisasjon|ungdomsrad|elevrad|vgs|kommune)/.test(header)
  ).length;
  return relevant * 25 + populated;
}

export function suggestHeaderRow(rows) {
  if (!rows.length) return 0;
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 10).forEach((row, index) => {
    const score = headerScoreForRow(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function scoreDelegatHeader(header) {
  if (header === "delegatnummer" || header === "delegatenummer") return 180;
  if (header.includes("delegat") && /(nummer|nr)/.test(header)) return 160;
  if (header === "delegatnr") return 155;
  if (header === "nummer" || header === "nr") return 75;
  if (header === "id") return 35;
  return 0;
}

function scoreNameHeader(header) {
  if (header === "fulltnavn" || header.includes("fulltnavn")) return 180;
  if (header === "fullname" || header.includes("fullname")) return 175;
  if (header === "navn" || header === "name") return 95;
  if (header.includes("heterdu") && header.includes("navn")) return 165;
  if (header.endsWith("navn") && !header.includes("organisasjon")) return 70;
  return 0;
}

function scoreOrgHeader(header) {
  if (header.includes("organisasjon") && header.includes("represent")) return 180;
  if (header.includes("ungdomsrad") && header.includes("represent")) return 170;
  if (header.includes("elevrad") && header.includes("represent")) return 165;
  if (header.includes("vgs") && header.includes("represent")) return 160;
  if (header.includes("kommune") && header.includes("represent")) return 155;
  if (header === "representerer" || header === "organisasjon") return 145;
  if (header.includes("representererdu")) return 90;
  if (/^(rad|elevrad|kommune|org)$/.test(header)) return 80;
  return 0;
}

function rankedColumns(rows, columnCount, headerIndex, scorer) {
  const dataRowCount = Math.max(1, rows.length - headerIndex - 1);
  return Array.from({ length: columnCount }, (_, index) => {
    const header = normalizeHeader(rows[headerIndex]?.[index]);
    const semanticScore = scorer(header);
    const fillRatio = populatedCount(rows, index, headerIndex) / dataRowCount;
    return { index, score: semanticScore + fillRatio * 20, semanticScore };
  })
    .filter((column) => column.semanticScore > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

export function suggestColumnMapping(rows, columnCount, headerIndex = 0) {
  const delegates = rankedColumns(rows, columnCount, headerIndex, scoreDelegatHeader);
  const names = rankedColumns(rows, columnCount, headerIndex, scoreNameHeader);
  const orgColumns = rankedColumns(rows, columnCount, headerIndex, scoreOrgHeader)
    .filter((column) => column.semanticScore >= 90)
    .map((column) => String(column.index));

  return {
    delegatnummer: delegates.length ? String(delegates[0].index) : "",
    fullName: names.length ? String(names[0].index) : "",
    orgColumns,
  };
}

export function createParticipantRow(id, delegatnummer = "", fullName = "", org = "") {
  return { id, delegatnummer, fullName, org };
}

export function buildImportedRows({
  rows,
  headerIndex,
  mapping,
  assignMissingNumbers = true,
}) {
  const orgColumns = Array.isArray(mapping.orgColumns) ? mapping.orgColumns : [];
  const imported = rows
    .slice(headerIndex + 1)
    .map((row, index) => {
      const org = orgColumns
        .map((column) =>
          formatRepresentation(
            row[Number(column)],
            rows[headerIndex]?.[Number(column)]
          )
        )
        .find(Boolean) || "";
      return createParticipantRow(
        index + 1,
        mapping.delegatnummer === ""
          ? ""
          : displayExcelValue(row[Number(mapping.delegatnummer)]).trim(),
        mapping.fullName === ""
          ? ""
          : displayExcelValue(row[Number(mapping.fullName)]).trim(),
        org
      );
    })
    .filter((row) => row.delegatnummer || row.fullName || row.org);

  if (!assignMissingNumbers) return imported;

  const usedNumbers = new Set(
    imported
      .map((row) => String(row.delegatnummer).trim())
      .filter((value) => /^[1-9]\d*$/.test(value))
      .map(Number)
  );
  let nextNumber = usedNumbers.size ? Math.max(...usedNumbers) + 1 : 1;
  return imported.map((row) => {
    if (String(row.delegatnummer).trim()) return row;
    while (usedNumbers.has(nextNumber)) nextNumber += 1;
    const updated = { ...row, delegatnummer: String(nextNumber) };
    usedNumbers.add(nextNumber);
    nextNumber += 1;
    return updated;
  });
}

export function validateParticipantRows(rows) {
  const normalized = rows.map((row) => ({
    ...row,
    delegatnummer: String(row.delegatnummer ?? "").trim(),
    fullName: String(row.fullName ?? "").trim(),
    org: String(row.org ?? "").trim(),
  }));
  const active = normalized.filter((row) => row.fullName || row.org);
  const errorsById = new Map();
  const numberCounts = new Map();

  for (const row of active) {
    const errors = [];
    if (!row.delegatnummer) errors.push("Mangler delegatnummer");
    else if (!/^[1-9]\d*$/.test(row.delegatnummer)) {
      errors.push("Delegatnummer må være et positivt heltall");
    }
    if (!row.fullName) errors.push("Mangler fullt navn");
    if (!row.org) errors.push("Mangler hvem deltakeren representerer");
    errorsById.set(row.id, errors);

    if (/^[1-9]\d*$/.test(row.delegatnummer)) {
      const key = String(Number(row.delegatnummer));
      numberCounts.set(key, (numberCounts.get(key) || 0) + 1);
    }
  }

  for (const row of active) {
    if (!/^[1-9]\d*$/.test(row.delegatnummer)) continue;
    const key = String(Number(row.delegatnummer));
    if ((numberCounts.get(key) || 0) > 1) {
      errorsById.get(row.id)?.push("Delegatnummer er duplisert");
    }
  }

  const errorCount = Array.from(errorsById.values()).filter((errors) => errors.length).length;
  return {
    normalized,
    active,
    errorsById,
    errorCount,
    hasAnyErrors: errorCount > 0,
  };
}

export function makeCsvContent(rows) {
  const escapeValue = (value) => {
    const text = String(value ?? "");
    if (/[";,\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  return [
    "delegatnummer;fullt navn;representerer",
    ...rows.map((row) =>
      [row.delegatnummer, row.fullName, row.org].map(escapeValue).join(";")
    ),
  ].join("\n");
}
