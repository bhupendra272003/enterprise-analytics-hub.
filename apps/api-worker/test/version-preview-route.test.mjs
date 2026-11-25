import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/datasets.ts", import.meta.url), "utf8");

test("version preview route fetches an exact version scoped to its dataset", () => {
  assert.ok(source.includes('if(sub.match(/^versions\\/\\d+\\/preview$/)&&req.method==="GET")'));
  assert.ok(source.includes("WHERE dataset_id=? AND version_number=?"));
  assert.ok(source.includes("Dataset version not found"));
  assert.ok(source.includes("preview:JSON.parse(version.previewJson"));
});
