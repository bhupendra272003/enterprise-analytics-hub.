import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/dataset-jobs.ts", import.meta.url), "utf8");

test("job revalidation rejects revoked handoffs and inactive memberships", () => {
  assert.match(source, /membership_status='ACTIVE'/);
  assert.match(source, /status<>'REVOKED'/);
  assert.match(source, /JOB_ACCESS_REVOKED/);
  assert.match(source, /JOIN_ACCESS_REVOKED/);
});

test("background dataset jobs revalidate active membership and source handoff at execution", () => {
  assert.match(source, /membership_status='ACTIVE'/);
  assert.match(source, /revalidateJobAccess\(env,job\)/);
  assert.match(source, /JOB_ACCESS_REVOKED/);
});

test("SQL background jobs revalidate joined dataset handoff at execution", () => {
  assert.match(source, /revalidateJobAccess\(env,job,JSON\.parse\(job\.payload_json\|\|\"\{\}\"\)\.joinDatasetId\)/);
  assert.match(source, /JOIN_ACCESS_REVOKED/);
});


test("rechecks access immediately before SQL and profile analysis", () => {
  const sqlStart = source.indexOf("async function runSqlJob");
  const profileStart = source.indexOf("async function runProfile");
  const sqlBody = source.slice(sqlStart, profileStart);
  const profileBody = source.slice(profileStart);
  assert.match(sqlBody, /await revalidateJobAccess\(env,job,payload\.joinDatasetId\);\s*await env\.DB\.prepare\("UPDATE dataset_jobs SET progress=45/);
  assert.match(profileBody, /await revalidateJobAccess\(env,job\);\s*const profile=columns\.map/);
});


test("profiling job failure transition cannot overwrite a cancellation", () => {
  const profileStart = source.indexOf("async function runProfile");
  const profileBody = source.slice(profileStart);
  assert.match(profileBody, /WHERE id=\? AND status='RUNNING'/);
});


test("SQL job failure transition is guarded against cancellation", () => {
  const sqlStart = source.indexOf("async function runSqlJob");
  const profileStart = source.indexOf("async function runProfile");
  const sqlBody = source.slice(sqlStart, profileStart);
  const catchBody = sqlBody.slice(sqlBody.lastIndexOf("}catch(e){"));
  assert.match(catchBody, /WHERE id=\? AND status='RUNNING'/);
  assert.doesNotMatch(catchBody, /status='RUNNING' AND status='RUNNING'/);
});
