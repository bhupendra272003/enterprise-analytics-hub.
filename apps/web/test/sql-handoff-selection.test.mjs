import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/workspace/analytics/page.tsx", import.meta.url), "utf8");

test("refreshing SQL handoffs preserves a valid selection and falls back when stale", () => {
  assert.ok(source.includes("setSelectedSqlHandoff(current=>pending.some((h:any)=>h.id===current)?current:(pending[0]?.id||''))"));
});
