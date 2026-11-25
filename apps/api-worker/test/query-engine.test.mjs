import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/query-engine.ts", import.meta.url), "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const moduleUrl = "data:text/javascript;base64," + Buffer.from(compiled).toString("base64");
const { runDatasetQuery, runDatasetJoinQuery, extractJoinDatasetToken } = await import(moduleUrl);
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

test("extracts only a valid same-workspace dataset token from JOIN SQL", () => {
  const token = "a".repeat(32);
  assert.equal(extractJoinDatasetToken("SELECT a.id FROM data a INNER JOIN dataset_" + token + " b ON a.id = b.id"), token);
  assert.equal(extractJoinDatasetToken("SELECT * FROM data"), null);
  assert.equal(extractJoinDatasetToken("SELECT * FROM data JOIN dataset_not-a-valid-token b ON data.id = b.id"), null);
});

test("supports OR predicates with standard AND precedence", () => {
  const sample = [
    { id: "1", region: "North", sales: "80" },
    { id: "2", region: "South", sales: "150" },
    { id: "3", region: "West", sales: "200" },
    { id: "4", region: "South", sales: "50" }
  ];
  const result = runDatasetQuery("SELECT id FROM data WHERE region = 'North' OR region = 'South' AND sales >= 100 ORDER BY id", sample, columns);
  assert.deepEqual(result.rows, [{ id: "1" }, { id: "2" }]);
});

test("supports DISTINCT projected values without splitting quoted OR text", () => {
  const sample = [
    { id: "1", region: "North OR South", sales: "10" },
    { id: "2", region: "North OR South", sales: "20" },
    { id: "3", region: "West", sales: "30" }
  ];
  const result = runDatasetQuery("SELECT DISTINCT region FROM data WHERE region = 'North OR South' OR region = 'West' ORDER BY region", sample, columns);
  assert.deepEqual(result.rows, [{ region: "North OR South" }, { region: "West" }]);
  assert.equal(result.rowCount, 2);
});


test("supports HAVING filters on aggregate expressions and SELECT aliases", () => {
  const byExpression = runDatasetQuery("SELECT region, SUM(sales) AS total_sales FROM data GROUP BY region HAVING SUM(sales) >= 275 ORDER BY total_sales DESC", rows, columns);
  assert.deepEqual(byExpression.rows, [{ region: "North", total_sales: 275 }]);
  const byAlias = runDatasetQuery("SELECT region, COUNT(*) AS order_count FROM data GROUP BY region HAVING order_count > 1", rows, columns);
  assert.deepEqual(byAlias.rows, [{ region: "North", order_count: 2 }]);
});

test("supports AND / OR in HAVING and rejects non-aggregate references", () => {
  const result = runDatasetQuery("SELECT region, SUM(sales) AS total_sales, COUNT(*) AS n FROM data GROUP BY region HAVING total_sales >= 250 AND n > 1 OR total_sales = 250", rows, columns);
  assert.deepEqual(result.rows, [{ region: "North", total_sales: 275, n: 2 }, { region: "South", total_sales: 250, n: 1 }]);
  assert.throws(() => runDatasetQuery("SELECT region, SUM(sales) AS total_sales FROM data GROUP BY region HAVING region = 'North'", rows, columns), /aggregate expression/);
});


test("supports COUNT DISTINCT for global and grouped aggregates", () => {
  const sample = [...rows, { id: "4", region: "North", sales: "175" }];
  assert.equal(runDatasetQuery("SELECT COUNT(DISTINCT region) AS unique_regions FROM data", sample, columns).rows[0].unique_regions, 2);
  const grouped = runDatasetQuery("SELECT region, COUNT(DISTINCT sales) AS unique_sales FROM data GROUP BY region ORDER BY region", sample, columns);
  assert.deepEqual(grouped.rows, [{ region: "North", unique_sales: 2 }, { region: "South", unique_sales: 1 }]);
  const having = runDatasetQuery("SELECT region, COUNT(DISTINCT sales) AS unique_sales FROM data GROUP BY region HAVING COUNT(DISTINCT sales) >= 2", sample, columns);
  assert.deepEqual(having.rows, [{ region: "North", unique_sales: 2 }]);
  assert.throws(() => runDatasetQuery("SELECT SUM(DISTINCT sales) FROM data", sample, columns), /only with COUNT/);
});


test("handles empty filtered aggregate results and NULL checks", () => {
  const sample = [
    { id: "1", region: "North", sales: "100" },
    { id: "2", region: "South", sales: null },
    { id: "3", region: "East", sales: "" }
  ];
  const empty = runDatasetQuery("SELECT COUNT(*) AS n, SUM(sales) AS total, AVG(sales) AS average FROM data WHERE region = 'Missing'", sample, columns);
  assert.deepEqual(empty.rows, [{ n: 0, total: 0, average: null }]);
  assert.equal(runDatasetQuery("SELECT COUNT(*) AS n FROM data WHERE sales IS NULL", sample, columns).rows[0].n, 2);
  assert.equal(runDatasetQuery("SELECT COUNT(*) AS n FROM data WHERE sales IS NOT NULL", sample, columns).rows[0].n, 1);
});

test("enforces LIMIT boundaries and rejects unsafe SELECT clauses", () => {
  assert.throws(() => runDatasetQuery("SELECT * FROM data LIMIT 0", rows, columns), /LIMIT/);
  assert.throws(() => runDatasetQuery("SELECT * FROM data LIMIT 501", rows, columns), /LIMIT/);
  assert.throws(() => runDatasetQuery("SELECT * FROM data UNION SELECT * FROM data", rows, columns), /read-only SELECT/);
  assert.throws(() => runDatasetQuery("SELECT * FROM data WHERE region = 'North'; SELECT * FROM data", rows, columns), /one read-only SELECT/);
});

test("supports escaped quote literals and case-insensitive string matching", () => {
  const sample = [{ id: "1", region: "O'Brien", sales: "10" }, { id: "2", region: "north", sales: "20" }];
  assert.deepEqual(runDatasetQuery("SELECT id FROM data WHERE region = 'O''Brien'", sample, columns).rows, [{ id: "1" }]);
  assert.deepEqual(runDatasetQuery("SELECT id FROM data WHERE region = 'NORTH'", sample, columns).rows, [{ id: "2" }]);
});
