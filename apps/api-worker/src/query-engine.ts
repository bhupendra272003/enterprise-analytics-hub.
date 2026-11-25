export type QueryRow = Record<string, string | number | null>;
export function extractJoinDatasetToken(sql:string):string|null { return sql.match(/\bJOIN\s+dataset_([a-f0-9]{32})\b/i)?.[1]?.toLowerCase()||null; }
type Condition = { column: string; operator: string; value?: string | number };
const cleanIdentifier = (value: string) => value.replace(/^[`"\[]|[`"\]]$/g, "");
function stripSqlComments(sql:string){let out="",quote="",i=0;while(i<sql.length){const ch=sql[i];if(quote){out+=ch;if(ch===quote){if(sql[i+1]===quote){out+=sql[i+1];i+=2;continue;}quote="";}i++;continue;}if(ch==="'"||ch==='"'){quote=ch;out+=ch;i++;continue;}if(ch==="-"&&sql[i+1]==="-"){while(i<sql.length&&sql[i]!=="\n"&&sql[i]!=="\r")i++;continue;}out+=ch;i++;}return out;}
const splitLogical = (value: string, operator: "AND" | "OR") => {
  const parts: string[] = [];
  let start=0,quote="",depth=0,i=0;
  while(i<value.length){
    const char=value[i];
    if(quote){if(char===quote){if(value[i+1]===quote){i+=2;continue;}quote="";}i++;continue;}
    if(char==="'"||char==='"'){quote=char;i++;continue;}
    if(char==="("){depth++;i++;continue;}
    if(char===")"){depth=Math.max(0,depth-1);i++;continue;}
    if(depth===0&&value.slice(i,i+operator.length).toUpperCase()===operator&&(i===0||/\s/.test(value[i-1]))&&(i+operator.length===value.length||/\s/.test(value[i+operator.length]))){
      parts.push(value.slice(start,i).trim());i+=operator.length;start=i;continue;
    }
    i++;
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
};
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
    const agg = item.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(DISTINCT\s+)?(\*|[\w."`\[\]-]+)\s*\)(?:\s+AS\s+([\w-]+))?$/i);
    if (agg) {
      const fn = agg[1].toUpperCase(), distinct = !!agg[2], column = cleanIdentifier(agg[3]);
      if (distinct && (fn !== "COUNT" || column === "*")) throw new Error("DISTINCT is supported only with COUNT(column).");
      if (column !== "*" && !columns.includes(column)) throw new Error("Unknown column: " + column);
      const defaultAlias = fn.toLowerCase() + (distinct ? "_distinct_" : (column === "*" ? "" : "_")) + (column === "*" ? "" : column);
      return { kind: "aggregate" as const, fn, column, distinct, alias: agg[4] || defaultAlias };
    }
    const col = item.match(/^([\w."`\[\]-]+)(?:\s+AS\s+([\w-]+))?$/i);
    if (!col) throw new Error("Unsupported SELECT expression: " + item);
    const column = cleanIdentifier(col[1]);
    if (!columns.includes(column)) throw new Error("Unknown column: " + column);
    return { kind: "column" as const, column, alias: col[2] || column };
  });
}
function parseHavingCondition(source: string, projections: ReturnType<typeof parseProjection>): Condition {
  const match = source.match(/^(.+?)\s*(>=|<=|<>|!=|=|>|<)\s*(?:'((?:''|[^'])*)'|("(?:[^"]|"")*")|(-?\d+(?:\.\d+)?))$/i);
  if (!match) throw new Error("Unsupported HAVING condition: " + source);
  const expression = match[1].trim().replace(/\s+/g, "").toLowerCase();
  const projection = projections.find(p => p.kind === "aggregate" && (
    p.alias.toLowerCase() === expression ||
    ((p.fn + "(" + (p.distinct ? "distinct " : "") + p.column + ")").replace(/\s+/g, "").toLowerCase() === expression)
  ));
  if (!projection || projection.kind !== "aggregate") throw new Error("HAVING must reference an aggregate expression or its SELECT alias.");
  const value = match[3] !== undefined ? match[3].replace(/''/g, "'") : match[4] !== undefined ? match[4].slice(1,-1).replace(/""/g,'"') : Number(match[5]);
  return { column: projection.alias, operator: match[2], value };
}
function aggregateValue(fn: string, column: string, rows: QueryRow[], distinct=false) {
  let values = column === "*" ? rows.map(() => 1) : rows.map(row => row[column]).filter(v => v !== "" && v !== null && v !== undefined);
  if (distinct) values = [...new Map(values.map(value => [String(value), value])).values()];
  const nums = values.map(Number).filter(Number.isFinite);
  if (fn === "COUNT") return values.length;
  if (fn === "SUM") { const total = nums.reduce((a,b)=>a+b,0); return Number.isFinite(total) ? total : null; }
  if (fn === "AVG") { const total = nums.reduce((a,b)=>a+b,0); return nums.length && Number.isFinite(total) ? total/nums.length : null; }
  if (fn === "MIN") return nums.length ? nums.reduce((a,b)=>Math.min(a,b),Infinity) : null;
  if (fn === "MAX") return nums.length ? nums.reduce((a,b)=>Math.max(a,b),-Infinity) : null;
  return null;
}
export function runDatasetQuery(sql: string, sourceRows: QueryRow[], sourceColumns: string[]) {
  if (typeof sql !== "string" || !sql.trim() || sql.length > 12000) throw new Error("Enter a SQL query up to 12,000 characters.");
  const statement = stripSqlComments(sql).trim().replace(/;\s*$/, "").trim();
  if (statement.includes(";") || !/^SELECT\b/i.test(statement)) throw new Error("Only one read-only SELECT statement is allowed.");
  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|INTO|UNION|WITH|RECURSIVE)\b/i.test(statement)) throw new Error("This SQL Studio supports read-only SELECT queries only.");
  const match = statement.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+([\w-]+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+GROUP\s+BY\s+([\w."`\[\]-]+(?:\s*,\s*[\w."`\[\]-]+)*))?(?:\s+HAVING\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\w."`\[\]-]+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i);
  if (!match) throw new Error("Use SELECT columns FROM data with optional WHERE, GROUP BY, HAVING, ORDER BY and LIMIT clauses.");
  if (!["data","dataset","records"].includes(match[2].toLowerCase())) throw new Error("FROM must reference the selected dataset as data.");
  const selectClause=match[1].trim(),distinct=/^DISTINCT\b/i.test(selectClause);
  const projections = parseProjection(distinct?selectClause.replace(/^DISTINCT\s+/i,""):selectClause, sourceColumns);
  if(distinct&&projections.some(p=>p.kind==="aggregate"))throw new Error("DISTINCT aggregate expressions are not supported; use a grouped query.");
  const where = match[3] ? splitLogical(match[3],"OR").map(group=>splitLogical(group,"AND").map(v=>parseCondition(v, sourceColumns))) : [];
  const groupColumns = match[4] ? match[4].split(",").map(v=>cleanIdentifier(v.trim())) : [];
  if (groupColumns.some(c=>!sourceColumns.includes(c))) throw new Error("GROUP BY contains an unknown column.");
  const having = match[5] ? splitLogical(match[5],"OR").map(group=>splitLogical(group,"AND").map(value=>parseHavingCondition(value,projections))) : [];
  const limit = match[8] ? Number(match[8]) : 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("LIMIT must be between 1 and 500.");
  const filteredRows = sourceRows.filter(row => !where.length || where.some(group => group.every(condition => compareCondition(row, condition))));
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
        else if (p.kind === "aggregate") output[p.alias] = aggregateValue(p.fn,p.column,group,p.distinct);
      }
      return output;
    });
    resultColumns = projections.filter(p=>p.kind!=="all").map(p=>p.kind==="column"?p.alias:p.alias);
  } else if (hasAggregates) {
    const aggregate: QueryRow = {};
    for (const p of projections) if (p.kind === "aggregate") aggregate[p.alias] = aggregateValue(p.fn,p.column,filteredRows,p.distinct);
    result = [aggregate]; resultColumns = projections.map(p=>p.kind==="aggregate"?p.alias:"");
  } else if (projections.some(p => p.kind === "all")) {
    resultColumns = sourceColumns;
    result = filteredRows.map(row => Object.fromEntries(sourceColumns.map(c=>[c,row[c]??""])));
  } else {
    resultColumns = projections.map(p => p.kind === "column" ? p.alias : "");
    result = filteredRows.map(row => Object.fromEntries(projections.filter(p=>p.kind==="column").map(p=>[p.alias,row[p.column]??""])));
  }
  if(distinct){
    const seen=new Set<string>();
    result=result.filter(row=>{const key=JSON.stringify(resultColumns.map(column=>row[column]??null));if(seen.has(key))return false;seen.add(key);return true;});
  }
  if(having.length&&!groupColumns.length)throw new Error("HAVING requires a GROUP BY clause.");
  if(having.length)result=result.filter(row=>having.some(group=>group.every(condition=>compareCondition(row,condition))));
  const orderBy = match[6] ? cleanIdentifier(match[6]) : "";
  if (orderBy) {
    const projection = projections.find(p=>p.kind==="column"&&(p.alias.toLowerCase()===orderBy.toLowerCase()||p.column.toLowerCase()===orderBy.toLowerCase())||p.kind==="aggregate"&&p.alias.toLowerCase()===orderBy.toLowerCase());
    const outputKey = resultColumns.find(c=>c.toLowerCase()===orderBy.toLowerCase()) || (projection?.kind==="column"||projection?.kind==="aggregate"?projection.alias:"");
    if (!outputKey) throw new Error("Unknown ORDER BY column: " + orderBy);
    const direction = match[7]?.toUpperCase()==="DESC" ? -1 : 1;
    result = result.slice().sort((a,b)=>{
      const av=a[outputKey]??"",bv=b[outputKey]??"",an=Number(av),bn=Number(bv);
      const cmp=String(av).trim()!==""&&String(bv).trim()!==""&&Number.isFinite(an)&&Number.isFinite(bn)?an-bn:String(av).localeCompare(String(bv));
      return direction*cmp;
    });
  }
  const rows = hasAggregates || groupColumns.length ? result.slice(0,limit) : result.slice(0,limit);
  return { columns: resultColumns, rows, rowCount: rows.length, matchedRows, truncated: result.length > limit, engine: "Vyron read-only CSV query engine" };
}



export function runDatasetJoinQuery(sql:string,leftRows:QueryRow[],leftColumns:string[],rightRows:QueryRow[],rightColumns:string[]){
 if(typeof sql!=="string"||!sql.trim()||sql.length>12000)throw new Error("Enter a SQL query up to 12,000 characters.");
 const statement=stripSqlComments(sql).trim().replace(/;\s*$/,"").trim();
 if(statement.includes(";")||!/^SELECT\b/i.test(statement)||/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|INTO|UNION|WITH|RECURSIVE)\b/i.test(statement))throw new Error("Only one read-only SELECT statement is allowed.");
 const match=statement.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+data\s+(?:AS\s+)?([a-zA-Z_]\w*)\s+(INNER|LEFT)\s+JOIN\s+dataset_([a-f0-9]{32})\s+(?:AS\s+)?([a-zA-Z_]\w*)\s+ON\s+([a-zA-Z_]\w*)\.([\w-]+)\s*=\s*([a-zA-Z_]\w*)\.([\w-]+)(?:\s+ORDER\s+BY\s+([a-zA-Z_]\w*\.[\w-]+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\d+))?$/i);
 if(!match)throw new Error("JOIN syntax: SELECT c.name, o.amount FROM data c INNER JOIN dataset_<32-character-id> o ON c.id = o.customer_id LIMIT 100.");
 const [,projection,leftAlias,joinType,token,rightAlias,onAliasA,onColumnA,onAliasB,onColumnB,orderRef,orderDirection,limitRaw]=match;
 if(leftAlias.toLowerCase()===rightAlias.toLowerCase())throw new Error("Use different aliases for the two datasets.");
 const resolve=(alias:string,column:string)=>{const isLeft=alias.toLowerCase()===leftAlias.toLowerCase(),isRight=alias.toLowerCase()===rightAlias.toLowerCase();if(!isLeft&&!isRight)throw new Error("Unknown table alias: "+alias);const cols=isLeft?leftColumns:rightColumns;const actual=cols.find(c=>c.toLowerCase()===column.toLowerCase());if(!actual)throw new Error("Unknown column: "+alias+"."+column);return isLeft?"L":"R";};const canonical=(alias:string,column:string)=>{const cols=alias.toLowerCase()===leftAlias.toLowerCase()?leftColumns:rightColumns;return cols.find(c=>c.toLowerCase()===column.toLowerCase())||column;};
 const aSide=resolve(onAliasA,onColumnA),bSide=resolve(onAliasB,onColumnB);if(aSide===bSide)throw new Error("JOIN must compare one column from each dataset.");
 const leftKey=canonical(leftAlias,aSide==="L"?onColumnA:onColumnB),rightKey=canonical(rightAlias,aSide==="R"?onColumnA:onColumnB);
 const limit=limitRaw?Number(limitRaw):100;if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error("LIMIT must be between 1 and 500.");
 const selections=projection.split(",").map((item:string)=>item.trim()).flatMap((item:string)=>{
  if(item==="*"||item.toLowerCase()===leftAlias.toLowerCase()+".*"||item.toLowerCase()===rightAlias.toLowerCase()+".*"){
   const includeLeft=item==="*"||item.toLowerCase()===leftAlias.toLowerCase()+".*",includeRight=item==="*"||item.toLowerCase()===rightAlias.toLowerCase()+".*";
   return [...(includeLeft?leftColumns.map(column=>({side:"L",column,output:leftAlias+"_"+column})):[]),...(includeRight?rightColumns.map(column=>({side:"R",column,output:rightAlias+"_"+column})):[])];
  }
  const col=item.match(/^([a-zA-Z_]\w*)\.([\w-]+)(?:\s+AS\s+([\w-]+))?$/i);if(!col)throw new Error("JOIN projections must use qualified columns, such as c.customer_name AS customer.");
  const side=resolve(col[1],col[2]);return [{side,column:canonical(col[1],col[2]),output:col[3]||col[1]+"_"+col[2]}];
 });
 if(!selections.length||new Set(selections.map((s:any)=>s.output.toLowerCase())).size!==selections.length)throw new Error("Selected output columns must have unique names.");
 const rightIndex=new Map<string,QueryRow[]>();for(const row of rightRows){const key=String(row[rightKey]??"");const bucket=rightIndex.get(key)||[];bucket.push(row);rightIndex.set(key,bucket);}
 const joined:QueryRow[]=[];let matchedRows=0;
 for(const left of leftRows){const key=String(left[leftKey]??"");const matches=key===""?[]:(rightIndex.get(key)||[]);if(matches.length){for(const right of matches){matchedRows++;if(joined.length>=100000)throw new Error("JOIN result exceeds the 100,000-row safety cap. Filter the source datasets or use a more selective key.");joined.push(Object.fromEntries(selections.map((s:any)=>[s.output,(s.side==="L"?left:right)[s.column]??""])));}}else if(joinType.toUpperCase()==="LEFT"){if(joined.length>=100000)throw new Error("JOIN result exceeds the 100,000-row safety cap.");joined.push(Object.fromEntries(selections.map((s:any)=>[s.output,s.side==="L"?(left[s.column]??""):null])));}}
 const columns=selections.map((s:any)=>s.output);
 if(orderRef){const [alias,column]=orderRef.split(".");if(alias.toLowerCase()!==leftAlias.toLowerCase()&&alias.toLowerCase()!==rightAlias.toLowerCase())throw new Error("Unknown table alias in ORDER BY: "+alias);const selected=selections.find((s:any)=>s.side===(alias.toLowerCase()===leftAlias.toLowerCase()?"L":"R")&&s.column===canonical(alias,column));if(!selected)throw new Error("ORDER BY must reference a selected qualified column.");const direction=orderDirection?.toUpperCase()==="DESC"?-1:1;joined.sort((a,b)=>{const av=a[selected.output]??"",bv=b[selected.output]??"",an=Number(av),bn=Number(bv);const cmp=String(av).trim()!==""&&String(bv).trim()!==""&&Number.isFinite(an)&&Number.isFinite(bn)?an-bn:String(av).localeCompare(String(bv));return direction*cmp;});}
 const rows=joined.slice(0,limit);return {columns,rows,rowCount:rows.length,matchedRows,matchedJoinRows:matchedRows,truncated:joined.length>limit,engine:"Vyron read-only CSV JOIN engine",joinType:joinType.toUpperCase(),joinRows:joined.length};
}
