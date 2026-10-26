import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import readXlsxFile from "read-excel-file/node";
import {
  buildImportedRows,
  compactExcelRows,
  makeCsvContent,
  suggestColumnMapping,
  suggestHeaderRow,
  validateParticipantRows,
} from "../src/utils/excelImport.js";

test("tutorial Excel file demonstrates merging columns without exporting extra data", async () => {
  const parsed = await readXlsxFile(fileURLToPath(new URL("../public/demo-paamelding.xlsx", import.meta.url)));
  const active = compactExcelRows(parsed);
  const headerIndex = suggestHeaderRow(active.rows);
  const mapping = suggestColumnMapping(active.rows, active.columnCount, headerIndex);

  assert.equal(active.startRow, 1);
  assert.equal(headerIndex, 2);
  assert.equal(mapping.delegatnummer, "1");
  assert.equal(mapping.fullName, "2");
  assert.deepEqual(mapping.orgColumns, ["3", "4"]);

  const onlyCouncil = buildImportedRows({
    rows: active.rows, headerIndex,
    mapping: { ...mapping, orgColumns: ["3"] },
    assignMissingNumbers: true,
  });
  assert.equal(onlyCouncil.length, 8);
  assert.equal(onlyCouncil[1].org, "");
  assert.equal(onlyCouncil[5].delegatnummer, "9");

  const combined = buildImportedRows({ rows: active.rows, headerIndex, mapping, assignMissingNumbers: true });
  assert.equal(combined[0].org, "Skien ungdomsråd");
  assert.equal(combined[1].org, "Skien VGS");
  assert.equal(validateParticipantRows(combined).errorCount, 1);

  combined[7].org = "Ekstern deltaker";
  const validation = validateParticipantRows(combined);
  assert.equal(validation.errorCount, 0);
  const csv = makeCsvContent(validation.active);
  assert.match(csv, /^delegatnummer;fullt navn;representerer\n/);
  assert.match(csv, /2;Birk Eksempel;Skien VGS/);
  assert.doesNotMatch(csv, /example\.org|Matpreferanse|Kommentar/);
});
