import test from "node:test";
import assert from "node:assert/strict";
import { applyDatasetCellEdits } from "../src/dataset-edits.ts";

const source = [
  { id: "1", name: "Ada", amount: "10" },
  { id: "2", name: "Lin", amount: "20" },
];

test("applies edits without mutating source rows or changing dataset shape", () => {
  const result = applyDatasetCellEdits(source, ["id", "name", "amount"], [
    { rowIndex: 0, column: "name", value: "Ada Lovelace" },
    { rowIndex: 1, column: "amount", value: "25" },
  ]);
  assert.equal(result.applied, 2);
  assert.deepEqual(result.rows, [
    { id: "1", name: "Ada Lovelace", amount: "10" },
    { id: "2", name: "Lin", amount: "25" },
  ]);
  assert.equal(source[0].name, "Ada");
});

test("rejects invalid, duplicate, unknown and oversized edits", () => {
  assert.throws(() => applyDatasetCellEdits(source, ["id", "name", "amount"], []), /between 1 and 1000/);
  assert.throws(() => applyDatasetCellEdits(source, ["id", "name", "amount"], [{ rowIndex: 9, column: "name", value: "x" }]), /outside the dataset/);
  assert.throws(() => applyDatasetCellEdits(source, ["id", "name", "amount"], [{ rowIndex: 0, column: "missing", value: "x" }]), /unknown column/);
  assert.throws(() => applyDatasetCellEdits(source, ["id", "name", "amount"], [{ rowIndex: 0, column: "name", value: "x" }, { rowIndex: 0, column: "name", value: "y" }]), /more than once/);
  assert.throws(() => applyDatasetCellEdits(source, ["id", "name", "amount"], [{ rowIndex: 0, column: "name", value: "x".repeat(10001) }]), /10000 characters/);
});


test("safely edits special property names and rejects duplicate column metadata", () => {
  const special = [{ "__proto__": "initial", safe: "x" }];
  const result = applyDatasetCellEdits(special, ["__proto__", "safe"], [{ rowIndex: 0, column: "__proto__", value: "changed" }]);
  assert.equal(Object.hasOwn(result.rows[0], "__proto__"), true);
  assert.equal(result.rows[0]["__proto__"], "changed");
  assert.equal(Object.getPrototypeOf(result.rows[0]), Object.prototype);
  assert.throws(() => applyDatasetCellEdits(source, ["id", "id"], [{ rowIndex: 0, column: "id", value: "x" }]), /unique/);
});
