function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function parseTsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "\t" && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("The TSV file contains an unclosed quoted field.");
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

export async function normalizeTabularFile(file: File): Promise<File> {
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension === "csv") return file;
  if (extension !== "tsv" && extension !== "txt" && extension !== "json") {
    throw new Error("Supported imports: CSV, TSV and JSON. XLSX import is not enabled yet.");
  }
  const source = await file.text();
  let columns: string[] = [], rows: unknown[][];
  if (extension === "json") {
    let parsed: unknown;
    try { parsed = JSON.parse(source); } catch { throw new Error("The JSON file is invalid."); }
    const candidate: unknown = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as any).rows) ? (parsed as any).rows : null;
    if (!Array.isArray(candidate) || !candidate.length || candidate.some((r: unknown) => !r || typeof r !== "object" || Array.isArray(r))) {
      throw new Error("JSON import expects an array of row objects, or an object containing a rows array.");
    }
    const records = candidate as Record<string, unknown>[];
    columns = [...new Set(records.flatMap(record => Object.keys(record)))];
    rows = records.map(record => columns.map(col => record[col]));
  } else {
    const parsed = parseTsv(source);
    if (parsed.length < 2) throw new Error("The TSV file must contain a header and at least one data row.");
    columns = parsed[0].map(v => v.trim());
    if (columns.some(v => !v)) throw new Error("Every TSV column must have a header.");
    rows = parsed.slice(1).map(r => columns.map((_,i)=>r[i] ?? ""));
  }
  if (!columns.length || !rows.length) throw new Error("The selected file contains no tabular records.");
  const csv = [columns.map(csvCell).join(","), ...rows.map(row => columns.map((_,i)=>csvCell(row[i])).join(","))].join("\r\n");
  return new File([csv], file.name.replace(/\.(json|tsv|txt)$/i, ".csv"), { type: "text/csv" });
}
