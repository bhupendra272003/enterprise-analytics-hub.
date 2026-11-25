import test from "node:test";
import assert from "node:assert/strict";
import { evaluateSpreadsheetFormula } from "../lib/spreadsheet-formulas.ts";

const columns = ["Region", "Sales", "Orders", "Note"];
const rows = [
  { Region: "North", Sales: "100", Orders: "2", Note: "  alpha  " },
  { Region: "South", Sales: "200", Orders: "3", Note: "beta" },
  { Region: "North", Sales: "300", Orders: "4", Note: "gamma" },
  { Region: "West", Sales: "50", Orders: "1", Note: "" }
];

const calc = (formula) => evaluateSpreadsheetFormula(formula, rows, columns);

test("calculates core aggregate formulas", () => {
  assert.equal(calc("=SUM(B2:B5)"), "650");
  assert.equal(calc("=AVERAGE(B2:B5)"), "162.5");
  assert.equal(calc("=COUNT(B2:B5)"), "4");
  assert.equal(calc("=COUNTA(A2:A5)"), "4");
  assert.equal(calc("=MIN(B2:B5)"), "50");
  assert.equal(calc("=MAX(B2:B5)"), "300");
});

test("supports conditional aggregates and comparison criteria", () => {
  assert.equal(calc('=SUMIF(A2:A5,"North",B2:B5)'), "400");
  assert.equal(calc('=COUNTIF(B2:B5,">100")'), "2");
  assert.equal(calc('=AVERAGEIF(A2:A5,"North",B2:B5)'), "200");
});

test("supports IF, text functions, CONCAT and ROUND", () => {
  assert.equal(calc('=IF(B2>50,"Pass","Fail")'), "Pass");
  assert.equal(calc("=LEFT(A2,3)"), "Nor");
  assert.equal(calc("=RIGHT(A2,2)"), "th");
  assert.equal(calc("=LEN(A2)"), "5");
  assert.equal(calc("=TRIM(D2)"), "alpha");
  assert.equal(calc('=CONCAT(A2,"-",B2)'), "North-100");
  assert.equal(calc("=ROUND(12.345,2)"), "12.35");
});

test("rejects malformed and out-of-page references safely", () => {
  assert.throws(() => calc("SUM(B2:B5)"), /Start a formula with =/);
  assert.throws(() => calc("=SUM(Z2:Z5)"), /stay inside/);
  assert.throws(() => calc("=UNKNOWN(B2:B5)"), /not supported/);
});

test("supports blank counting, text case and additional numeric functions", () => {
  assert.equal(calc("=COUNTBLANK(D2:D5)"), "1");
  assert.equal(calc("=UPPER(A2)"), "NORTH");
  assert.equal(calc("=LOWER(A2)"), "north");
  assert.equal(calc('=PROPER("north east")'), "North East");
  assert.equal(calc('=PROPER("north-east_sales")'), "North-East_Sales");
  assert.equal(calc('=CONCATENATE(A2,"-","Q1")'), "North-Q1");
  assert.equal(calc("=ABS(-12.5)"), "12.5");
  assert.equal(calc("=SQRT(81)"), "9");
  assert.equal(calc("=POWER(2,5)"), "32");
  assert.equal(calc("=MOD(17,5)"), "2");
  assert.equal(calc("=ROUNDUP(12.341,2)"), "12.35");
  assert.equal(calc("=ROUNDDOWN(12.349,2)"), "12.34");
});


test("supports multi-criteria SUMIFS, COUNTIFS and AVERAGEIFS", () => {
  assert.equal(calc('=SUMIFS(B2:B5,A2:A5,"North",C2:C5,">2")'), "300");
  assert.equal(calc('=COUNTIFS(A2:A5,"North",C2:C5,">2")'), "1");
  assert.equal(calc('=AVERAGEIFS(B2:B5,A2:A5,"North",C2:C5,">2")'), "300");
});
