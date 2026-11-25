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


test("COUNT counts nonblank measure values including text while numeric aggregations reject text", () => {
  const mixed = [
    { region: "West", sales: "12" },
    { region: "West", sales: "unknown" },
    { region: "West", sales: "  " },
    { region: "West", sales: null },
    { region: "West", sales: "0" },
  ];
  assert.deepEqual(aggregateCategoryRows(mixed, "region", "sales", "", "COUNT").chartRows, [{ label: "West", value: 3 }]);
  assert.deepEqual(aggregateCategoryRows(mixed, "region", "sales", "", "SUM").chartRows, [{ label: "West", value: 12 }]);
});

test("handles missing category values and case-insensitive category filters", () => {
  const missing = [{ sales: "3" }, { region: "  ", sales: "7" }, { region: "north", sales: "2" }];
  assert.deepEqual(aggregateCategoryRows(missing, "region", "sales", "NORTH", "SUM").chartRows, [{ label: "north", value: 2 }]);
  assert.deepEqual(aggregateCategoryRows(missing, "region", "sales", "", "SUM").chartRows, [{ label: "(blank)", value: 10 }, { label: "north", value: 2 }]);
});


test("rejects missing chart fields and safely handles extreme numeric values", () => {
  assert.throws(() => aggregateCategoryRows(rows, "", "sales", "", "SUM"), /category and measure/);
  const extreme = [{region:"X",sales:"1e308"},{region:"X",sales:"1e308"}];
  const result = aggregateCategoryRows(extreme,"region","sales","","SUM");
  assert.deepEqual(result.chartRows,[{label:"X",value:0}]);
});
