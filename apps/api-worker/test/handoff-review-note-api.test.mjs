import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/datasets.ts", import.meta.url), "utf8");

test("API rejects approval and return decisions without reviewer notes", () => {
  assert.ok(source.includes('(status==="APPROVED"||status==="RETURNED")&&!reviewNote'));
  assert.ok(source.includes('A review note is required to approve this handoff.'));
  assert.ok(source.includes('A review note is required to return this handoff.'));
});
