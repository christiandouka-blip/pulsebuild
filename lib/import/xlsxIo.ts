import * as XLSX from "@stackline/xlsx";

/**
 * Isolated XLSX adapter. This is the only production module allowed to import
 * the spreadsheet library. Callers receive stored cell text only.
 */
export type StoredXlsxCell = {
  text: string;
  formula?: string;
};

export type StoredXlsxSheet = {
  name: string;
  rows: Array<{ excelRow: number; cells: StoredXlsxCell[] }>;
};

export type XlsxWriteCell = {
  t?: "s" | "n" | "b" | "str" | "z";
  v?: string | number | boolean;
  f?: string;
  l?: { Target: string };
};

export type XlsxWriteSheet = {
  name: string;
  rows: Array<Array<string | number | boolean>>;
  cells?: Record<string, XlsxWriteCell>;
};

export function readStoredXlsx(bytes: Uint8Array): StoredXlsxSheet[] {
  const workbook = XLSX.read(bytes, {
    type: "buffer",
    cellFormula: true,
    cellHTML: false,
    cellNF: false,
    cellDates: false,
    raw: true,
    dense: false,
  });

  const sheets: StoredXlsxSheet[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    sheets.push({ name, rows: sheetToStoredRows(sheet) });
  }
  return sheets;
}

export function writeXlsxWorkbook(sheets: XlsxWriteSheet[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    if (sheet.cells) {
      for (const [address, cell] of Object.entries(sheet.cells)) {
        worksheet[address] = cell as XLSX.CellObject;
      }
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    bookSST: false,
    compression: true,
  }) as Buffer;
  return new Uint8Array(buffer);
}

function sheetToStoredRows(sheet: XLSX.WorkSheet): StoredXlsxSheet["rows"] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: StoredXlsxSheet["rows"] = [];
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const cells: StoredXlsxCell[] = [];
    let empty = true;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address] as XLSX.CellObject | undefined;
      const text = cellStoredText(cell);
      const formula = typeof cell?.f === "string" && cell.f ? cell.f : undefined;
      if (text !== "" || formula) empty = false;
      cells.push({ text, formula });
    }
    if (!empty) rows.push({ excelRow: r + 1, cells });
  }
  return rows;
}

function cellStoredText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  const value = cell.v;
  if (value === undefined || value === null) return "";
  if (value instanceof Date) {
    return String(value.getTime() / 86400000 + 25569);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return String(value);
}
