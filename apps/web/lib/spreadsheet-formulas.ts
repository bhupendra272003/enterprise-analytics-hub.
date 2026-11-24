export type SpreadsheetRow = Record<string, unknown>;

function splitArgs(source: string): string[] {
  const parts: string[] = [];
  let start = 0, quoted = false, depth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { i++; continue; }
      quoted = !quoted;
    } else if (!quoted) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) { parts.push(source.slice(start, i).trim()); start = i + 1; }
    }
  }
  if (quoted || depth !== 0) throw new Error("Check quotes and parentheses in the formula.");
  parts.push(source.slice(start).trim());
  return parts;
}

function columnIndex(letters: string): number {
  let value = 0;
  for (const ch of letters.toUpperCase()) value = value * 26 + ch.charCodeAt(0) - 64;
  return value - 1;
}

function readRange(reference: string, rows: SpreadsheetRow[], columns: string[]): unknown[] {
  const match = reference.trim().toUpperCase().match(/^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/);
  if (!match) throw new Error("Use a cell or range such as A2:A51.");
  const firstCol = columnIndex(match[1]), lastCol = match[3] ? columnIndex(match[3]) : firstCol;
  const firstRow = Number(match[2]) - 2, lastRow = match[4] ? Number(match[4]) - 2 : firstRow;
  if (firstCol < 0 || lastCol >= columns.length || firstRow < 0 || lastRow < firstRow || lastRow >= rows.length) {
    throw new Error("The formula range must stay inside the currently visible page (maximum 50 data rows).");
  }
  const values: unknown[] = [];
  for (let r = firstRow; r <= lastRow; r++) for (let c = firstCol; c <= lastCol; c++) values.push(rows[r]?.[columns[c]]);
  return values;
}

function numeric(values: unknown[]): number[] {
  return values.filter(v => v !== null && v !== undefined && String(v).trim() !== "").map(Number).filter(Number.isFinite);
}

function criterionMatches(value: unknown, criterion: string): boolean {
  const raw = criterion.trim();
  const op = raw.match(/^(>=|<=|<>|>|<|=)\\s*(.*)$/);
  if (!op) return String(value ?? "") === raw;
  const expected = op[2].replace(/^"|"$/g, "");
  const leftNumber = Number(value), rightNumber = Number(expected);
  const bothNumeric = String(value ?? "").trim() !== "" && expected.trim() !== "" && Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  const left = bothNumeric ? leftNumber : String(value ?? "");
  const right = bothNumeric ? rightNumber : expected;
  const comparison = typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left).localeCompare(String(right));
  switch (op[1]) {
    case ">": return comparison > 0;
    case "<": return comparison < 0;
    case ">=": return comparison >= 0;
    case "<=": return comparison <= 0;
    case "<>": return comparison !== 0;
    default: return comparison === 0;
  }
}

export function evaluateSpreadsheetFormula(formula: string, rows: SpreadsheetRow[], columns: string[]): string {
  const source = formula.trim();
  if (!source.startsWith("=")) throw new Error("Start a formula with =, for example =SUM(B2:B51).");
  const match = source.slice(1).match(/^([A-Z]+)((.*))$/i);
  if (!match) throw new Error("Supported formulas: SUM, AVERAGE, COUNT, COUNTA, MIN, MAX, SUMIF, COUNTIF and AVERAGEIF.");
  const name = match[1].toUpperCase(), args = splitArgs(match[2]);
  const range = (arg: string) => readRange(arg, rows, columns);
  if (["SUM","AVERAGE","COUNT","COUNTA","MIN","MAX"].includes(name)) {
    if (args.length !== 1) throw new Error(name + " expects one cell range.");
    const values = range(args[0]), nums = numeric(values);
    if (name === "COUNTA") return String(values.filter(v => v !== null && v !== undefined && String(v).trim() !== "").length);
    if (name === "COUNT") return String(nums.length);
    if (!nums.length && name !== "SUM") return "0";
    if (name === "SUM") return String(nums.reduce((a,b)=>a+b,0));
    if (name === "AVERAGE") return String(nums.reduce((a,b)=>a+b,0)/nums.length);
    if (name === "MIN") return String(Math.min(...nums));
    return String(Math.max(...nums));
  }
  if (["SUMIF","COUNTIF","AVERAGEIF"].includes(name)) {
    if (args.length < 2 || args.length > 3) throw new Error(name + " expects criteria range, criteria and optional sum/average range.");
    const criteriaValues = range(args[0]), criterion = args[1].replace(/^"|"$/g, "");
    const targetValues = args[2] ? range(args[2]) : criteriaValues;
    if (targetValues.length !== criteriaValues.length) throw new Error("Criteria and value ranges must have the same number of cells.");
    const selected = targetValues.filter((_,i)=>criterionMatches(criteriaValues[i],criterion));
    if (name === "COUNTIF") return String(selected.filter(v=>v!==null&&v!==undefined&&String(v).trim()!=="").length);
    const nums = numeric(selected);
    if (name === "SUMIF") return String(nums.reduce((a,b)=>a+b,0));
    return nums.length ? String(nums.reduce((a,b)=>a+b,0)/nums.length) : "0";
  }
  throw new Error("This formula is not supported yet.");
}
