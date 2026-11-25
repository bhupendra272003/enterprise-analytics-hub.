import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/workspace/analytics/page.tsx", import.meta.url), "utf8");

test("opening a different dataset resets stale grid filters, sorting, and formula result", () => {
  const openDataset = source.slice(source.indexOf("async function openDataset"), source.indexOf("useEffect(()=>{if(!active?.id)"));
  assert.ok(openDataset.includes("setFilter('')"));
  assert.ok(openDataset.includes("setSort('')"));
  assert.ok(openDataset.includes("setAscending(true)"));
  assert.ok(openDataset.includes("setFormulaResult('')"));
});
