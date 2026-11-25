import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source=await readFile(new URL("../app/workspace/handoffs/page.tsx",import.meta.url),"utf8");
test("handoff approval and return actions require reviewer feedback",()=>{
 assert.ok(source.includes("(status==='APPROVED'||status==='RETURNED')&&!reviewNotes[handoff.id]?.trim()"));
 assert.ok(source.includes("Add a review note before approving this handoff."));
 assert.ok(source.includes("Add a review note explaining what needs revision."));
});
