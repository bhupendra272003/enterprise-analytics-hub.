import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/generator-jobs.ts", import.meta.url), "utf8");

test("generator publication commits completion, audit and notification together", () => {
  const batchStart = source.indexOf("await env.DB.batch([", source.indexOf("async function finalize"));
  assert.notEqual(batchStart, -1, "publication D1 batch exists");
  const batchEnd = source.indexOf("]);", batchStart);
  assert.notEqual(batchEnd, -1, "publication batch closes");
  const publicationBatch = source.slice(batchStart, batchEnd);
  assert.match(publicationBatch, /UPDATE generation_jobs SET status='COMPLETED'/);
  assert.match(publicationBatch, /INSERT OR IGNORE INTO audit_logs/);
  assert.match(publicationBatch, /INSERT OR IGNORE INTO notifications/);
  assert.match(publicationBatch, /generation-ready-/);
  assert.doesNotMatch(source.slice(batchEnd), /INSERT .*INTO notifications/);
  assert.doesNotMatch(source.slice(batchEnd), /INSERT .*INTO audit_logs/);
});

test("generator completion side effects use deterministic notification identity", () => {
  assert.match(source, /bind\("generation-ready-"\+job\.id/);
  assert.match(source, /INSERT OR IGNORE INTO notifications/);
  assert.match(source, /INSERT OR IGNORE INTO audit_logs/);
});
