export type ChartAggregation = "SUM" | "AVG" | "COUNT" | "MIN" | "MAX";

export function aggregateCategoryRows(
  rows: Record<string, unknown>[],
  category: string,
  measure: string,
  filter: string,
  aggregation: ChartAggregation,
) {
  if (!["SUM", "AVG", "COUNT", "MIN", "MAX"].includes(aggregation)) throw new Error("Unsupported chart aggregation.");
  if (!category || !measure) throw new Error("Choose a category and measure column.");
  const groups = new Map<string, { sum: number; count: number; min: number; max: number }>();
  for (const row of rows) {
    const label = String(row[category] ?? "").trim() || "(blank)";
    if (filter && !label.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) continue;
    const raw = String(row[measure] ?? "").trim();
    if (!raw) continue;
    const value = Number(raw);
    if (aggregation !== "COUNT" && !Number.isFinite(value)) continue;
    const current = groups.get(label) || { sum: 0, count: 0, min: Infinity, max: -Infinity };
    if (aggregation === "COUNT") {
      current.sum += 1;
      current.count += 1;
      current.min = Math.min(current.min, 1);
      current.max = Math.max(current.max, 1);
    } else {
      current.sum += value;
      current.count += 1;
      current.min = Math.min(current.min, value);
      current.max = Math.max(current.max, value);
    }
    groups.set(label, current);
  }
  const chartRows = [...groups.entries()].map(([label, stats]) => {
    const value = aggregation === "COUNT" ? stats.count
      : aggregation === "AVG" ? stats.sum / stats.count
      : aggregation === "MIN" ? stats.min
      : aggregation === "MAX" ? stats.max
      : stats.sum;
    if (!Number.isFinite(value)) throw new Error("Chart aggregation overflowed numeric range.");
    return { label, value: Number(value.toFixed(3)) };
  }).sort((a, b) => b.value - a.value).slice(0, 20);
  return { chartRows, matchedGroups: groups.size };
}
