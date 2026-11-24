import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/query-engine.ts", import.meta.url), "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const moduleUrl = "data:text/javascript;base64," + Buffer.from(compiled).toString("base64");
const { runDatasetQuery, runDatasetJoinQuery } = await import(moduleUrl);
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


test("keeps AND inside quoted string values intact", () => {
  const sample = [...rows, { id: "4", region: "North AND South", sales: "50" }];
  const result = runDatasetQuery("SELECT id FROM data WHERE region = 'North AND South' AND id = '4' LIMIT 10", sample, columns);
  assert.deepEqual(result.rows, [{ id: "4" }]);
});

test("supports LIKE and NULL predicates", () => {
  const sample = [
    { id: "1", region: "North", sales: "100" },
    { id: "2", region: "South-East", sales: "" },
    { id: "3", region: null, sales: "175" }
  ];
  assert.equal(runDatasetQuery("SELECT COUNT(*) AS total FROM data WHERE region LIKE 'South%' ", sample, columns).rows[0].total, 1);
  assert.equal(runDatasetQuery("SELECT COUNT(*) AS total FROM data WHERE sales IS NULL", sample, columns).rows[0].total, 1);
});

test("supports grouped COUNT and numeric MIN/MAX", () => {
  const result = runDatasetQuery("SELECT region, COUNT(*) AS n, MIN(sales) AS low, MAX(sales) AS high FROM data GROUP BY region ORDER BY n DESC", rows, columns);
  assert.equal(result.rows[0].region, "North");
  assert.equal(result.rows[0].n, 2);
  assert.equal(result.rows[0].low, 100);
  assert.equal(result.rows[0].high, 175);
});


test("supports tenant-scoped inner joins with qualified projections", () => {
  const customers = [{id:"1",name:"A"},{id:"2",name:"B"},{id:"3",name:"C"}];
  const orders = [{customer_id:"1",amount:"20"},{customer_id:"1",amount:"30"},{customer_id:"3",amount:"15"}];
  const result = runDatasetJoinQuery("SELECT c.name AS customer, o.amount FROM data c INNER JOIN dataset_0123456789abcdef0123456789abcdef o ON c.id = o.customer_id ORDER BY o.amount DESC LIMIT 10", customers, ["id","name"], orders, ["customer_id","amount"]);
  assert.equal(result.rowCount,3);
  assert.deepEqual(result.rows[0],{customer:"A",o_amount:"30"});
});

test("supports left joins and enforces the result cap", () => {
  const result = runDatasetJoinQuery("SELECT c.name, o.amount FROM data c LEFT JOIN dataset_0123456789abcdef0123456789abcdef o ON c.id = o.customer_id LIMIT 10", [{id:"1",name:"A"},{id:"2",name:"B"}], ["id","name"], [{customer_id:"1",amount:"20"}], ["customer_id","amount"]);
  assert.equal(result.rowCount,2);
  assert.equal(result.rows[1].o_amount,null);
  assert.throws(()=>runDatasetJoinQuery("SELECT * FROM data c INNER JOIN dataset_0123456789abcdef0123456789abcdef o ON c.id = o.customer_id LIMIT 501", [], ["id"], [], ["customer_id"]),/LIMIT/);
});
