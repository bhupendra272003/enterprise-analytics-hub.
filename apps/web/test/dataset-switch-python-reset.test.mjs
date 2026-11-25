import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/workspace/analytics/page.tsx", import.meta.url), "utf8");

test("opening a dataset clears Python cleaning report and resets cleaning options", () => {
  const openDataset = source.slice(source.indexOf("async function openDataset"), source.indexOf("useEffect(()=>{if(!active?.id"));
  assert.ok(openDataset.includes("if(active?.id!==id){setPythonReport(null)"));
  assert.ok(openDataset.includes("setPythonOutput('Choose a dataset"));
  assert.ok(openDataset.includes("setPythonOptions({trimWhitespace:true,removeDuplicates:true,fillMissing:'none'})"));
});
