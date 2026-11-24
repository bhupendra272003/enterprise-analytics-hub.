import test from "node:test";
import assert from "node:assert/strict";
import { aggregateCategoryRows } from "../src/bi-aggregation.ts";

const rows = [
  { region: "North", sales: "10" },
  { region: "North", sales: "20" },
  { region: "North", sales: "" },
  { region: "South", sales: "40" },
];

test("aggregates grouped measures with SUM, AVG, COUNT, MIN and MAX", () => {
  assert.deepEqual(aggregateCategoryRows(rows, "region", "sales", "", "SUM").chartRows, [
    { label: "South", value: 40 }, { label: "North", value: 30 },
  ]);
  assert.deepEqual(aggregateCategoryRows(rows, "region", "sales", "", "AVG").chartRows, [
    { label: "South", value: 40 }, { label: "North", value: 15 },
  ]);
  assert.deepEqual(aggregateCategoryRows(rows, "region", "sales", "", "COUNT").chartRows, [
    { label: "North", value: 2 }, { label: "South", value: 1 },
  ]);
  assert.deepEqual(aggregateCategoryRows(rows, "region", "sales", "", "MIN").chartRows, [
    { label: "South", value: 40 }, { label: "North", value: 10 },
  ]);
  assert.deepEqual(aggregateCategoryRows(rows, "region", "sales", "", "MAX").chartRows, [
    { label: "South", value: 40 }, { label: "North", value: 20 },
  ]);
});

test("applies category filters and ignores empty or invalid measure values", () => {
  const result = aggregateCategoryRows([...rows, { region: "East", sales: "unknown" }], "region", "sales", "north", "SUM");
  assert.deepEqual(result.chartRows, [{ label: "North", value: 30 }]);
  assert.equal(result.matchedGroups, 1);
});
