import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/dataset-jobs.ts", import.meta.url), "utf8");

test("background dataset jobs revalidate active membership and source handoff at execution", () => {
  assert.match(source, /membership_status='ACTIVE'/);
  assert.match(source, /revalidateJobAccess\(env,job\)/);
  assert.match(source, /JOB_ACCESS_REVOKED/);
});

test("SQL background jobs revalidate joined dataset handoff at execution", () => {
  assert.match(source, /revalidateJobAccess\(env,job,JSON\.parse\(job\.payload_json\|\|\"\{\}\"\)\.joinDatasetId\)/);
  assert.match(source, /JOIN_ACCESS_REVOKED/);
});
