export type DatasetCellEdit = { rowIndex: number; column: string; value: string };

export function applyDatasetCellEdits(
  sourceRows: Record<string, unknown>[],
  columns: string[],
  rawChanges: unknown,
): { rows: Record<string, string>[]; applied: number } {
  if (!Array.isArray(sourceRows) || sourceRows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {\n    throw new Error("Dataset rows must be objects.");\n  }\n  if (!Array.isArray(rawChanges) || rawChanges.length < 1 || rawChanges.length > 1000) {
    throw new Error("Submit between 1 and 1000 cell changes.");
  }
  if (!Array.isArray(columns) || columns.length === 0 || columns.some((column) => typeof column !== "string" || !column.trim()) || new Set(columns).size !== columns.length) {
    throw new Error("Dataset columns must be unique, non-empty names.");
  }
  const rows = sourceRows.map((row) => Object.fromEntries(columns.map((column) => [column, String(row[column] ?? "")])));
  const seen = new Set<string>();
  for (const item of rawChanges) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("A cell change is invalid.");
    const change = item as Record<string, unknown>;
    const rowIndex = change.rowIndex;
    const column = change.column;
    const value = change.value;
    if (!Number.isInteger(rowIndex) || (rowIndex as number) < 0 || (rowIndex as number) >= rows.length) {
      throw new Error("A cell change references a row outside the dataset.");
    }
    if (typeof column !== "string" || !columns.includes(column)) throw new Error("A cell change references an unknown column.");
    if (typeof value !== "string" || value.length > 10000) throw new Error("Cell values must be text with at most 10000 characters.");
    const key = String(rowIndex) + "\u0000" + column;
    if (seen.has(key)) throw new Error("The same cell cannot be changed more than once in one save.");
    seen.add(key);
    Object.defineProperty(rows[rowIndex as number], column, { value, enumerable: true, writable: true, configurable: true });
  }
  return { rows, applied: rawChanges.length };
}
