import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/query-engine.ts", import.meta.url), "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const moduleUrl = "data:text/javascript;base64," + Buffer.from(compiled).toString("base64");
const { runDatasetQuery } = await import(moduleUrl);
const columns = ["id", "region", "sales"];
const rows = [
  { id: "1", region: "North", sales: "100" },
  { id: "2", region: "South", sales: "250" },
  { id: "3", region: "North", sales: "175" }
];

test("runs a bounded SELECT against the selected dataset", () => {
  const result = runDatasetQuery("SELECT * FROM data LIMIT 2;", rows, columns);
  assert.equal(result.rowCount, 2);
  assert.equal(result.matchedRows, 3);
  assert.equal(result.truncated, true);
  assert.equal(result.rows[0].region, "North");
});

test("filters and sorts selected dataset rows", () => {
  const result = runDatasetQuery("SELECT id, sales FROM data WHERE region = 'North' ORDER BY sales DESC LIMIT 10", rows, columns);
  assert.deepEqual(result.rows, [{ id: "3", sales: "175" }, { id: "1", sales: "100" }]);
});

test("supports safe aggregate queries", () => {
  const result = runDatasetQuery("SELECT COUNT(*) AS total, SUM(sales) AS total_sales, AVG(sales) AS average_sales FROM data", rows, columns);
  assert.equal(result.rows[0].total, 3);
  assert.equal(result.rows[0].total_sales, 525);
  assert.equal(result.rows[0].average_sales, 175);
});

test("groups rows and orders aggregate output", () => {
  const result = runDatasetQuery("SELECT region, SUM(sales) AS total_sales FROM data GROUP BY region ORDER BY total_sales DESC LIMIT 10", rows, columns);
  assert.deepEqual(result.rows, [{ region: "North", total_sales: 275 }, { region: "South", total_sales: 250 }]);
});

test("rejects writes, multiple statements and unknown columns", () => {
  assert.throws(() => runDatasetQuery("DELETE FROM data", rows, columns), /SELECT/);
  assert.throws(() => runDatasetQuery("SELECT * FROM data; DELETE FROM data", rows, columns), /one read-only SELECT/);
  assert.throws(() => runDatasetQuery("SELECT password FROM data", rows, columns), /Unknown column/);
});
