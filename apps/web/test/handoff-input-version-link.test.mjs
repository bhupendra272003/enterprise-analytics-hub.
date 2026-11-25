import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source=await readFile(new URL("../app/workspace/handoffs/page.tsx",import.meta.url),"utf8");
test("handoffs expose a link to the assigned immutable input dataset version",()=>{
 assert.ok(source.includes("encodeURIComponent(String(item.inputVersion))"));
 assert.ok(source.includes("&version='+encodeURIComponent(String(item.inputVersion))"));
 assert.ok(source.includes("Open assigned input version v{item.inputVersion}"));
});
