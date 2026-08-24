import { parse as parseCsv } from "csv-parse/sync";
import JSZip from "jszip";
import {
  COMPANY_IMPORT_COLUMNS,
  CONTACT_IMPORT_COLUMNS,
  emptyToNull,
  matchImportColumn,
} from "@nbs/shared";

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function columnIndex(cellRef: string): number {
  const letters = /^[A-Za-z]+/.exec(cellRef)?.[0] ?? "A";
  let index = 0;
  for (const char of letters.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index;
}

function rowIndex(cellRef: string): number {
  return Number(/(\d+)$/.exec(cellRef)?.[1] ?? "0");
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) {
    return [];
  }
  const strings: string[] = [];
  const itemPattern = /<(?:[A-Za-z]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?si>/g;
  let item = itemPattern.exec(xml);
  while (item) {
    const texts = [...item[1]!.matchAll(/<(?:[A-Za-z]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?t>/g)];
    strings.push(decodeXml(texts.map((match) => match[1] ?? "").join("")));
    item = itemPattern.exec(xml);
  }
  return strings;
}

function cellInnerText(inner: string, type: string | undefined, sharedStrings: string[]): string {
  if (type === "inlineStr") {
    const texts = [...inner.matchAll(/<(?:[A-Za-z]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?t>/g)];
    return decodeXml(texts.map((match) => match[1] ?? "").join("")).trim();
  }
  const value = /<(?:[A-Za-z]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z]+:)?v>/.exec(inner)?.[1] ?? "";
  const decoded = decodeXml(value).trim();
  if (type === "s") {
    const index = Number(decoded);
    return sharedStrings[index] ?? "";
  }
  return decoded;
}

function parseSheetMatrix(sheetXml: string, sharedStrings: string[]): Map<number, Map<number, string>> {
  const matrix = new Map<number, Map<number, string>>();
  const cellPattern =
    /<(?:[A-Za-z]+:)?c\b([^>/]*?)\s*(\/>|>([\s\S]*?)<\/(?:[A-Za-z]+:)?c>)/g;
  let match = cellPattern.exec(sheetXml);
  while (match) {
    const attrs = match[1] ?? "";
    const ref = /(?:^|\s)r="([^"]+)"/.exec(attrs)?.[1];
    if (ref) {
      const type = /(?:^|\s)t="([^"]+)"/.exec(attrs)?.[1];
      const inner = match[3] ?? "";
      const text = cellInnerText(inner, type, sharedStrings);
      const row = rowIndex(ref);
      const col = columnIndex(ref);
      let rowMap = matrix.get(row);
      if (!rowMap) {
        rowMap = new Map();
        matrix.set(row, rowMap);
      }
      rowMap.set(col, text);
    }
    match = cellPattern.exec(sheetXml);
  }
  return matrix;
}

async function rowsFromXlsx(buffer: Buffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buffer);
  const sheetEntry =
    zip.file("xl/worksheets/sheet1.xml") ??
    Object.values(zip.files).find((entry) =>
      !entry.dir && /xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name),
    );
  if (!sheetEntry) {
    return [];
  }
  const sharedXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? null;
  const sheetXml = await sheetEntry.async("string");
  const matrix = parseSheetMatrix(sheetXml, parseSharedStrings(sharedXml));
  const maxRow = Math.max(0, ...matrix.keys());
  const maxCol = Math.max(
    0,
    ...[...matrix.values()].flatMap((row) => [...row.keys()]),
  );
  const rows: string[][] = [];
  for (let row = 1; row <= maxRow; row += 1) {
    const rowMap = matrix.get(row);
    const values: string[] = [];
    for (let col = 1; col <= maxCol; col += 1) {
      values[col - 1] = rowMap?.get(col)?.trim() ?? "";
    }
    rows.push(values);
  }
  return rows;
}

function mapRow(
  raw: Record<string, string | null>,
  columns: readonly string[],
): Record<string, string | null> {
  const mapped: Record<string, string | null> = {};
  for (const column of columns) {
    mapped[column] = null;
  }
  for (const [header, value] of Object.entries(raw)) {
    const column = matchImportColumn(header, columns);
    if (!column) {
      continue;
    }
    mapped[column] = emptyToNull(value);
  }
  return mapped;
}

export async function rowsFromSpreadsheet(
  filename: string,
  buffer: Buffer,
  entity: "COMPANIES" | "CONTACTS",
): Promise<Record<string, string | null>[]> {
  const columns = entity === "CONTACTS" ? CONTACT_IMPORT_COLUMNS : COMPANY_IMPORT_COLUMNS;
  const lower = filename.toLowerCase();

  if (lower.endsWith(".csv")) {
    const records = parseCsv(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as Record<string, string>[];
    return records.map((record) => {
      const raw: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(record)) {
        raw[key] = emptyToNull(value);
      }
      return mapRow(raw, columns);
    });
  }

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const table = await rowsFromXlsx(buffer);
    const [headerRow, ...dataRows] = table;
    if (!headerRow) {
      return [];
    }
    return dataRows
      .map((values) => {
        const raw: Record<string, string | null> = {};
        headerRow.forEach((header, index) => {
          if (!header) {
            return;
          }
          raw[header] = emptyToNull(values[index] ?? "");
        });
        return mapRow(raw, columns);
      })
      .filter((row) => Object.values(row).some(Boolean));
  }

  throw new Error("FILE_TYPE");
}
