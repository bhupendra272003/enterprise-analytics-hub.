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
function aggregateValue(fn: string, column: string, rows: QueryRow[]) {
  const values = column === "*" ? rows.map(() => 1) : rows.map(row => row[column]).filter(v => v !== "" && v !== null && v !== undefined);
  const nums = values.map(Number).filter(Number.isFinite);
  if (fn === "COUNT") return values.length;
  if (fn === "SUM") return nums.reduce((a,b)=>a+b,0);
  if (fn === "AVG") return nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : null;
  if (fn === "MIN") return nums.length ? Math.min(...nums) : null;
  if (fn === "MAX") return nums.length ? Math.max(...nums) : null;
  return null;
}
export function runDatasetQuery(sql: string, sourceRows: QueryRow[], sourceColumns: string[]) {
  if (typeof sql !== "string" || !sql.trim() || sql.length > 12000) throw new Error("Enter a SQL query up to 12,000 characters.");
  const statement = sql.replace(/--[^\n\r]*/g, "").trim().replace(/;\s*$/, "").trim();
  if (statement.includes(";") || !/^SELECT\b/i.test(statement)) throw new Error("Only one read-only SELECT statement is allowed.");
  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|INTO|UNION|WITH|RECURSIVE)\b/i.test(statement)) throw new Error("This SQL Studio supports read-only SELECT queries only.");
  const match = statement.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+([\w-]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+GROUP\s+BY\s+([\w."`\[\]-]+(?:\s*,\s*[\w."`\[\]-]+)*))?(?:\s+ORDER\s+BY\s+([\w."`\[\]-]+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i);
  if (!match) throw new Error("Use SELECT columns FROM data with optional WHERE, GROUP BY, ORDER BY and LIMIT clauses.");
  if (!["data","dataset","records"].includes(match[2].toLowerCase())) throw new Error("FROM must reference the selected dataset as data.");
  const projections = parseProjection(match[1], sourceColumns);
  const where = match[3] ? splitAnd(match[3]).map(v => parseCondition(v, sourceColumns)) : [];
  const groupColumns = match[4] ? match[4].split(",").map(v=>cleanIdentifier(v.trim())) : [];
  if (groupColumns.some(c=>!sourceColumns.includes(c))) throw new Error("GROUP BY contains an unknown column.");
  const limit = match[7] ? Number(match[7]) : 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("LIMIT must be between 1 and 500.");
  const filteredRows = sourceRows.filter(row => where.every(condition => compareCondition(row, condition)));
  const matchedRows = filteredRows.length;
  const hasAggregates = projections.some(p => p.kind === "aggregate");
  if (groupColumns.length && !hasAggregates) throw new Error("GROUP BY requires at least one aggregate function.");
  if (hasAggregates && !groupColumns.length && projections.some(p => p.kind === "column" || p.kind === "all")) throw new Error("Select only aggregate expressions, or add a GROUP BY clause.");
  let result: QueryRow[] = [];
  let resultColumns: string[] = [];
  if (groupColumns.length) {
    for (const p of projections) if (p.kind === "column" && !groupColumns.includes(p.column)) throw new Error("Selected column " + p.column + " must appear in GROUP BY.");
    const groups = new Map<string, QueryRow[]>();
    for (const row of filteredRows) {
      const key = JSON.stringify(groupColumns.map(c=>row[c]??""));
      const bucket = groups.get(key) || [];
      bucket.push(row); groups.set(key,bucket);
    }
    result = [...groups.values()].map(group => {
      const output: QueryRow = {};
      for (const p of projections) {
        if (p.kind === "column") output[p.alias] = group[0][p.column] ?? "";
        else if (p.kind === "aggregate") output[p.alias] = aggregateValue(p.fn,p.column,group);
      }
      return output;
    });
    resultColumns = projections.filter(p=>p.kind!=="all").map(p=>p.kind==="column"?p.alias:p.alias);
  } else if (hasAggregates) {
    const aggregate: QueryRow = {};
    for (const p of projections) if (p.kind === "aggregate") aggregate[p.alias] = aggregateValue(p.fn,p.column,filteredRows);
    result = [aggregate]; resultColumns = projections.map(p=>p.kind==="aggregate"?p.alias:"");
  } else if (projections.some(p => p.kind === "all")) {
    resultColumns = sourceColumns;
    result = filteredRows.map(row => Object.fromEntries(sourceColumns.map(c=>[c,row[c]??""])));
  } else {
    resultColumns = projections.map(p => p.kind === "column" ? p.alias : "");
    result = filteredRows.map(row => Object.fromEntries(projections.filter(p=>p.kind==="column").map(p=>[p.alias,row[p.column]??""])));
  }
  const orderBy = match[5] ? cleanIdentifier(match[5]) : "";
  if (orderBy) {
    const projection = projections.find(p=>p.kind==="column"&&(p.alias===orderBy||p.column===orderBy)||p.kind==="aggregate"&&p.alias===orderBy);
    const outputKey = resultColumns.includes(orderBy) ? orderBy : projection?.kind==="column" ? projection.alias : "";
    if (!outputKey) throw new Error("Unknown ORDER BY column: " + orderBy);
    const direction = match[6]?.toUpperCase()==="DESC" ? -1 : 1;
    result = result.slice().sort((a,b)=>{
      const av=a[outputKey]??"",bv=b[outputKey]??"",an=Number(av),bn=Number(bv);
      const cmp=String(av).trim()!==""&&String(bv).trim()!==""&&Number.isFinite(an)&&Number.isFinite(bn)?an-bn:String(av).localeCompare(String(bv));
      return direction*cmp;
    });
  }
  const rows = hasAggregates || groupColumns.length ? result.slice(0,limit) : result.slice(0,limit);
  return { columns: resultColumns, rows, rowCount: rows.length, matchedRows, truncated: result.length > limit, engine: "Vyron read-only CSV query engine" };
}
