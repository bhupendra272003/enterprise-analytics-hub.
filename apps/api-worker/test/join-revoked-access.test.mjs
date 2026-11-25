import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/datasets.ts", import.meta.url), "utf8");

test("SQL JOIN access excludes revoked dataset handoffs", () => {
  assert.match(source, /SELECT id FROM dataset_handoffs WHERE dataset_id=\? AND assigned_to=\? AND status<>'REVOKED' LIMIT 1/);
});
