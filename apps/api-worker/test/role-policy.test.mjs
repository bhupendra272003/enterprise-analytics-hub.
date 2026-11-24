import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/role-policy.ts", import.meta.url), "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 });
const moduleUrl = "data:text/javascript;base64," + Buffer.from(compiled).toString("base64");
const { canAnalyzeDataset, canUploadSourceDataset, canManageReports, canCreateOrganization, canCancelDatasetJob } = await import(moduleUrl);

test("only Owner, Team Leader and Analyst can run analytics", () => {
  assert.equal(canAnalyzeDataset("OWNER"), true);
  assert.equal(canAnalyzeDataset("LEADER"), true);
  assert.equal(canAnalyzeDataset("ANALYST"), true);
  assert.equal(canAnalyzeDataset("MANAGER"), false);
});

test("only Owner can upload source data and manage reports", () => {
  for (const role of ["OWNER", "MANAGER", "LEADER", "ANALYST"]) {
    assert.equal(canUploadSourceDataset(role), role === "OWNER");
    assert.equal(canManageReports(role), role === "OWNER");
  }
});

test("organization creation requires Owner membership or platform super-admin", () => {
  assert.equal(canCreateOrganization(false, false), false);
  assert.equal(canCreateOrganization(false, true), true);
  assert.equal(canCreateOrganization(true, false), true);
});

test("job cancellation is Owner-only or limited to the requester", () => {
  assert.equal(canCancelDatasetJob("MANAGER", "analyst-1", "analyst-1"), true);
  assert.equal(canCancelDatasetJob("ANALYST", "analyst-1", "analyst-2"), false);
  assert.equal(canCancelDatasetJob("OWNER", "analyst-1", "owner-1"), true);
});
