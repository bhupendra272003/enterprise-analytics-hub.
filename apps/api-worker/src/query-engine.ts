export type QueryRow = Record<string, string | number | null>;
type Condition = { column: string; operator: string; value?: string | number };
const cleanIdentifier = (value: string) => value.replace(/^[`"\[]|[`"\]]$/g, "");
const splitAnd = (value: string) => value.split(/\s+AND\s+/i).map(v => v.trim()).filter(Boolean);
function parseCondition(source: string, columns: string[]): Condition {
  const nullMatch = source.match(/^([\w\s."`\[\]-]+?)\s+IS\s+(NOT\s+)?NULL$/i);
  if (nullMatch) {
    const column = cleanIdentifier(nullMatch[1].trim());
    if (!columns.includes(column)) throw new Error("Unknown column: " + column);
    return { column, operator: nullMatch[2] ? "IS NOT NULL" : "IS NULL" };
  }
  const match = source.match(/^([\w\s."`\[\]-]+?)\s*(>=|<=|<>|!=|=|>|<|LIKE)\s*(?:'((?:''|[^'])*)'|("(?:[^"]|"")*")|(-?\d+(?:\.\d+)?))$/i);
  if (!match) throw new Error("Unsupported WHERE condition: " + source);
  const column = cleanIdentifier(match[1].trim());
  if (!columns.includes(column)) throw new Error("Unknown column: " + column);
  const value = match[3] !== undefined ? match[3].replace(/''/g, "'") : match[4] !== undefined ? match[4].slice(1,-1).replace(/""/g,'"') : Number(match[5]);
  return { column, operator: match[2].toUpperCase(), value };
}
function compareCondition(row: QueryRow, condition: Condition): boolean {
  const raw = row[condition.column];
  if (condition.operator === "IS NULL") return raw === null || raw === undefined || raw === "";
  if (condition.operator === "IS NOT NULL") return raw !== null && raw !== undefined && raw !== "";
  const left = raw === null || raw === undefined ? "" : raw;
  const right = condition.value ?? "";
  const ln = Number(left), rn = Number(right);
  const numeric = String(left).trim() !== "" && String(right).trim() !== "" && Number.isFinite(ln) && Number.isFinite(rn);
  const a: string | number = numeric ? ln : String(left).toLowerCase();
  const b: string | number = numeric ? rn : String(right).toLowerCase();
  switch (condition.operator) {
    case "=": return a === b;
    case "!=": case "<>": return a !== b;
    case ">": return a > b;
    case "<": return a < b;
    case ">=": return a >= b;
    case "<=": return a <= b;
    case "LIKE": {
      const pattern = String(right).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
      return new RegExp("^" + pattern + "$", "i").test(String(left));
    }
    default: return false;
  }
}
function parseProjection(source: string, columns: string[]) {
  return source.split(",").map(part => {
    const item = part.trim();
    if (item === "*") return { kind: "all" as const };
    const agg = item.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(\*|[\w."`\[\]-]+)\s*\)(?:\s+AS\s+([\w-]+))?$/i);
    if (agg) {
      const fn = agg[1].toUpperCase(), column = cleanIdentifier(agg[2]);
      if (column !== "*" && !columns.includes(column)) throw new Error("Unknown column: " + column);
      return { kind: "aggregate" as const, fn, column, alias: agg[3] || (fn.toLowerCase() + (column === "*" ? "" : "_" + column)) };
    }
    const col = item.match(/^([\w."`\[\]-]+)(?:\s+AS\s+([\w-]+))?$/i);
    if (!col) throw new Error("Unsupported SELECT expression: " + item);
    const column = cleanIdentifier(col[1]);
    if (!columns.includes(column)) throw new Error("Unknown column: " + column);
    return { kind: "column" as const, column, alias: col[2] || column };
  });
}
export function runDatasetQuery(sql: string, sourceRows: QueryRow[], sourceColumns: string[]) {
  if (typeof sql !== "string" || !sql.trim() || sql.length > 12000) throw new Error("Enter a SQL query up to 12,000 characters.");
  const statement = sql.replace(/--[^\n\r]*/g, "").trim().replace(/;\s*$/, "").trim();
  if (statement.includes(";") || !/^SELECT\b/i.test(statement)) throw new Error("Only one read-only SELECT statement is allowed.");
  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|INTO|UNION|WITH|RECURSIVE)\b/i.test(statement)) throw new Error("This SQL Studio supports read-only SELECT queries only.");
  const match = statement.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+([\w-]+)(?:\s+(?:AS\s+)?([\w-]+))?(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\w."`\[\]-]+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i);
  if (!match) throw new Error("Use SELECT columns FROM data with optional WHERE, ORDER BY and LIMIT clauses.");
  const projections = parseProjection(match[1], sourceColumns);
  const where = match[4] ? splitAnd(match[4]).map(v => parseCondition(v, sourceColumns)) : [];
  const limit = match[7] ? Number(match[7]) : 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("LIMIT must be between 1 and 500.");
  let rows = sourceRows.filter(row => where.every(condition => compareCondition(row, condition)));
  const filteredCount = rows.length;
  const orderBy = match[5] ? cleanIdentifier(match[5]) : "";
  if (orderBy && !sourceColumns.includes(orderBy)) throw new Error("Unknown ORDER BY column: " + orderBy);
  if (orderBy) rows = rows.slice().sort((a,b) => {
    const av = a[orderBy] ?? "", bv = b[orderBy] ?? "";
    const an = Number(av), bn = Number(bv);
    const cmp = String(av).trim() !== "" && String(bv).trim() !== "" && Number.isFinite(an) && Number.isFinite(bn) ? an-bn : String(av).localeCompare(String(bv));
    return (match[6]?.toUpperCase() === "DESC" ? -1 : 1) * cmp;
  });
  const aggregates = projections.some(p => p.kind === "aggregate");
  if (aggregates && projections.some(p => p.kind === "column" || p.kind === "all")) throw new Error("Mixing aggregate and regular columns requires GROUP BY, which is not enabled yet.");
  let result: QueryRow[], resultColumns: string[];
  if (aggregates) {
    const aggregate: QueryRow = {};
    for (const p of projections) if (p.kind === "aggregate") {
      const values = p.column === "*" ? rows.map(() => 1) : rows.map(row => row[p.column]).filter(v => v !== "" && v !== null && v !== undefined);
      const nums = values.map(Number).filter(Number.isFinite);
      let value: number | null = null;
      if (p.fn === "COUNT") value = values.length;
      else if (p.fn === "SUM") value = nums.reduce((a,b)=>a+b,0);
      else if (p.fn === "AVG") value = nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : null;
      else if (p.fn === "MIN") value = nums.length ? Math.min(...nums) : null;
      else if (p.fn === "MAX") value = nums.length ? Math.max(...nums) : null;
      aggregate[p.alias] = value;
    }
    result = [aggregate]; resultColumns = projections.map(p => p.kind === "aggregate" ? p.alias : "");
  } else if (projections.some(p => p.kind === "all")) {
    resultColumns = sourceColumns; result = rows.slice(0,limit).map(row => Object.fromEntries(sourceColumns.map(c=>[c,row[c] ?? ""])));
  } else {
    resultColumns = projections.map(p => p.kind === "column" ? p.alias : "");
    result = rows.slice(0,limit).map(row => Object.fromEntries(projections.filter(p=>p.kind==="column").map(p=>[p.alias,row[p.column] ?? ""])));
  }
  return { columns: resultColumns, rows: aggregates ? result : result.slice(0,limit), rowCount: aggregates ? result.length : Math.min(filteredCount,limit), matchedRows: filteredCount, truncated: !aggregates && filteredCount > limit, engine: "Vyron read-only CSV query engine" };
}
