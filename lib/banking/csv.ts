import Decimal from "decimal.js";

// Bank statement CSV helpers shared by the bank inbox and bank reconciliation.

export function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some((cell) => cell.trim()) || rows.length === 0) rows.push(row);
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

// Accepts ISO dates, UK day-first dates (dd/mm/yyyy, dd-mm-yy) and "12 Oct 2026".
export function parseDate(value: string): string {
  const input = value.trim().split(/[ T]\d{1,2}:\d{2}/)[0];
  let year: string; let month: string; let day: string;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(input);
  const named = /^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ -](\d{2}|\d{4})$/.exec(input);
  if (iso) [, year, month, day] = iso;
  else if (uk) [, day, month, year] = uk;
  else if (named && MONTHS[named[2].toLowerCase()]) { [, day, , year] = named; month = MONTHS[named[2].toLowerCase()]; }
  else throw new Error(`Unrecognised date: ${value.trim()}`);
  if (year.length === 2) year = `20${year}`;
  const result = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const check = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== result) throw new Error(`Invalid date: ${value.trim()}`);
  return result;
}

export function parseAmount(value: string): string {
  let input = value.trim().replace(/^(GBP|USD|EUR|£|\$|€)\s*/i, "").replace(/^-\s*£/, "-").replaceAll(",", "").replaceAll(" ", "");
  if (input.startsWith("(") && input.endsWith(")")) input = `-${input.slice(1, -1)}`;
  if (/^\+/.test(input)) input = input.slice(1);
  if (!/^-?\d{1,11}(?:\.\d{1,4})?$/.test(input)) throw new Error(`Unrecognised amount: ${value.trim()}`);
  return input;
}

export type ColumnMapping = { date: number; description: number; reference: number; amount: number; paidIn: number; paidOut: number };

const HEADER_NAMES: Record<keyof ColumnMapping, string[]> = {
  date: ["date", "transaction date", "posting date", "posted date", "value date", "completed date"],
  description: ["description", "details", "narrative", "name", "counter party", "counterparty", "payee", "merchant", "transaction description", "memo"],
  reference: ["reference", "transaction id", "transaction reference", "notes and #tags", "notes"],
  amount: ["amount", "signed amount", "amount (gbp)", "value", "money in/out"],
  paidIn: ["paid in", "money in", "credit", "credit amount", "in"],
  paidOut: ["paid out", "money out", "debit", "debit amount", "out"],
};

export function detectColumns(headers: string[]): ColumnMapping {
  const normalised = headers.map((header) => header.trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " "));
  const find = (names: string[]) => names.map((name) => normalised.indexOf(name)).find((index) => index >= 0) ?? -1;
  const mapping = {} as ColumnMapping;
  for (const key of Object.keys(HEADER_NAMES) as Array<keyof ColumnMapping>) mapping[key] = find(HEADER_NAMES[key]);
  if (mapping.reference === mapping.description) mapping.reference = -1;
  return mapping;
}

export type StatementRow = { transaction_date: string; description: string; reference?: string; amount: string; fingerprint: string };

export function mappingProblem(mapping: ColumnMapping): string | null {
  if (mapping.date < 0) return "Choose which column holds the date.";
  if (mapping.description < 0) return "Choose which column describes the transaction.";
  if (mapping.amount < 0 && (mapping.paidIn < 0 || mapping.paidOut < 0)) return "Choose an amount column, or both a money-in and a money-out column.";
  return null;
}

// Converts data rows using the mapping. Money in is positive, money out negative.
// The fingerprint lets a re-imported, overlapping statement skip lines already imported.
export function statementRows(dataRows: string[][], mapping: ColumnMapping): StatementRow[] {
  const problem = mappingProblem(mapping);
  if (problem) throw new Error(problem);
  const occurrences = new Map<string, number>();
  const rows: StatementRow[] = [];
  dataRows.forEach((cells, index) => {
    const cell = (column: number) => (column >= 0 ? cells[column]?.trim() ?? "" : "");
    const line = `Row ${index + 2}`;
    try {
      let amount: Decimal;
      if (mapping.amount >= 0) amount = new Decimal(parseAmount(cell(mapping.amount)));
      else {
        const paidIn = cell(mapping.paidIn) ? new Decimal(parseAmount(cell(mapping.paidIn))).abs() : new Decimal(0);
        const paidOut = cell(mapping.paidOut) ? new Decimal(parseAmount(cell(mapping.paidOut))).abs() : new Decimal(0);
        amount = paidIn.minus(paidOut);
      }
      if (amount.isZero()) return; // balance-only or pending rows
      const description = cell(mapping.description) || cell(mapping.reference);
      if (!description) throw new Error("missing description");
      const transaction_date = parseDate(cell(mapping.date));
      const reference = cell(mapping.reference) || undefined;
      const key = [transaction_date, amount.toFixed(2), description.toLowerCase(), (reference ?? "").toLowerCase()].join("|");
      const occurrence = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, occurrence);
      rows.push({ transaction_date, description: description.slice(0, 500), reference: reference?.slice(0, 150), amount: amount.toFixed(2), fingerprint: `${key}|${occurrence}`.slice(0, 700) });
    } catch (error) {
      throw new Error(`${line}: ${error instanceof Error ? error.message : "could not be read"}`);
    }
  });
  return rows;
}
