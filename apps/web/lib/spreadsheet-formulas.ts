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
  const op = raw.match(/^(>=|<=|<>|>|<|=)\s*(.*)$/);
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
  const match = source.slice(1).match(/^([A-Z]+)\((.*)\)$/i);
  if (!match) throw new Error("Supported formulas: SUM, AVERAGE, COUNT, COUNTA, MIN, MAX, SUMIF, COUNTIF and AVERAGEIF.");
  const name = match[1].toUpperCase(), args = splitArgs(match[2]);
  const range = (arg: string) => readRange(arg, rows, columns);
  const scalar = (arg: string): unknown => {
    const value = arg.trim();
    if (/^".*"$/.test(value)) return value.slice(1, -1).replace(/""/g, '"');
    if (/^(TRUE|FALSE)$/i.test(value)) return value.toUpperCase() === "TRUE";
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    if (/^\$?[A-Z]{1,3}\$?\d+$/i.test(value)) return range(value)[0] ?? "";
    throw new Error("Use a quoted text, number, boolean or single cell reference for this argument.");
  };
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
  if (name === "COUNTBLANK") {
    if (args.length !== 1) throw new Error("COUNTBLANK expects one cell range.");
    return String(range(args[0]).filter(v => v === null || v === undefined || String(v).trim() === "").length);
  }
  if (["UPPER","LOWER","PROPER"].includes(name)) {
    if (args.length !== 1) throw new Error(name + " expects one text argument.");
    const value = String(scalar(args[0]) ?? "");
    if (name === "UPPER") return value.toLocaleUpperCase();
    if (name === "LOWER") return value.toLocaleLowerCase();
    return value.toLocaleLowerCase().replace(/(^|[\s_-])([a-z])/g, (_, prefix, letter) => prefix + letter.toLocaleUpperCase());
  }
  if (["ABS","SQRT","POWER","MOD"].includes(name)) {
    const expected = name === "POWER" || name === "MOD" ? 2 : 1;
    if (args.length !== expected) throw new Error(name + " expects " + expected + " numeric argument(s).");
    const values = args.map(arg => Number(scalar(arg)));
    if (values.some(value => !Number.isFinite(value))) throw new Error(name + " requires finite numeric arguments.");
    if (name === "SQRT" && values[0] < 0) throw new Error("SQRT requires a non-negative number.");
    if (name === "MOD" && values[1] === 0) throw new Error("MOD cannot divide by zero.");
    const result = name === "ABS" ? Math.abs(values[0]) : name === "SQRT" ? Math.sqrt(values[0]) : name === "POWER" ? values[0] ** values[1] : values[0] % values[1];
    if (!Number.isFinite(result)) throw new Error(name + " result is outside the supported numeric range.");
    return String(result);
  }
  if (["SUMIF","COUNTIF","AVERAGEIF"].includes(name)) {
    if (args.length < 2 || args.length > 3) throw new Error(name + " expects criteria range, criteria and optional sum/average range.");
    const criteriaValues = range(args[0]), criterion = args[1].replace(/^"|"$/g, "");
    const targetValues = args[2] ? range(args[2]) : criteriaValues;
    if (targetValues.length !== criteriaValues.length) throw new Error("Criteria and value ranges must have the same number of cells.");
    const selected = targetValues.filter((_,i)=>criterionMatches(criteriaValues[i],criterion));
    if (name === "COUNTIF") return String(criteriaValues.filter(v=>criterionMatches(v,criterion)).length);
    const nums = numeric(selected);
    if (name === "SUMIF") return String(nums.reduce((a,b)=>a+b,0));
    return nums.length ? String(nums.reduce((a,b)=>a+b,0)/nums.length) : "0";
  }
  if (name === "IF") {
    if (args.length !== 3) throw new Error("IF expects a condition, true value and false value.");
    const condition = args[0].trim().match(/^(.*?)\s*(>=|<=|<>|>|<|=)\s*(.*?)$/);
    let passed: boolean;
    if (condition) passed = criterionMatches(scalar(condition[1]), condition[2] + String(scalar(condition[3])));
    else { const value = scalar(args[0]); passed = value === true || (typeof value === "number" && value !== 0) || (typeof value === "string" && value.length > 0); }
    return String(scalar(passed ? args[1] : args[2]) ?? "");
  }
  if (name === "CONCAT" || name === "CONCATENATE") return args.flatMap(arg => arg.includes(":") ? range(arg) : [scalar(arg)]).map(v => String(v ?? "")).join("");
  if (["LEFT","RIGHT","LEN","TRIM"].includes(name)) {
    if ((name === "LEN" || name === "TRIM") ? args.length !== 1 : args.length < 1 || args.length > 2) throw new Error(name + " has an invalid number of arguments.");
    const value = String(scalar(args[0]) ?? "");
    const count = args[1] ? Number(scalar(args[1])) : 1;
    if (!Number.isInteger(count) || count < 0 || count > 10000) throw new Error("Text length must be a whole number from 0 to 10000.");
    if (name === "LEN") return String(value.length);
    if (name === "TRIM") return value.trim().replace(/\s+/g, " ");
    return name === "LEFT" ? value.slice(0, count) : count === 0 ? "" : value.slice(-count);
  }
  if (["ROUND","ROUNDUP","ROUNDDOWN"].includes(name)) {
    if (args.length < 1 || args.length > 2) throw new Error(name + " expects a number and optional decimal places.");
    const value = Number(scalar(args[0])), places = args[1] ? Number(scalar(args[1])) : 0;
    if (!Number.isFinite(value) || !Number.isInteger(places) || Math.abs(places) > 10) throw new Error("ROUND requires a finite number and decimal places between -10 and 10.");
    const factor = 10 ** places;
    const scaled = value * factor;
    const rounded = name === "ROUNDUP" ? Math.sign(scaled) * Math.ceil(Math.abs(scaled)) : name === "ROUNDDOWN" ? Math.trunc(scaled) : Math.round(scaled + Number.EPSILON);
    return String(rounded / factor);
  }
  if (["SUMIFS","COUNTIFS","AVERAGEIFS"].includes(name)) {
    if (name === "COUNTIFS" ? args.length < 2 || args.length % 2 !== 0 : args.length < 3 || args.length % 2 !== 1) throw new Error(name + " expects criteria range/criteria pairs and a target range where required.");
    const target = name === "COUNTIFS" ? range(args[0]) : range(args[0]);
    const offset = name === "COUNTIFS" ? 0 : 1;
    const criteriaPairs = args.slice(offset).reduce((pairs, arg, i, list) => { if (i % 2 === 0) pairs.push([range(arg), list[i+1]?.replace(/^"|"$/g, "")]); return pairs; }, [] as [unknown[], string][]);
    if (criteriaPairs.some(([values]) => values.length !== target.length)) throw new Error("All criteria ranges must have the same number of cells as the target range.");
    const filtered = target.filter((_,i)=>criteriaPairs.every(([values,criterion])=>criterionMatches(values[i],criterion)));
    if (name === "COUNTIFS") return String(target.filter((_,i)=>criteriaPairs.every(([values,criterion])=>criterionMatches(values[i],criterion))).length);
    const nums = numeric(filtered);
    if (name === "SUMIFS") return String(nums.reduce((a,b)=>a+b,0));
    return nums.length ? String(nums.reduce((a,b)=>a+b,0)/nums.length) : "0";
  }
  throw new Error("This formula is not supported yet.");
}
