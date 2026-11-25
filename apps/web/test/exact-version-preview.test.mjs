import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source=await readFile(new URL("../app/workspace/data/page.tsx",import.meta.url),"utf8");
test("Data Studio supports selecting and loading immutable dataset versions",()=>{
 assert.ok(source.includes("'/versions/'+versionNumber+'/preview'"));
 assert.ok(source.includes("get('version')"));
 assert.ok(source.includes('VIEW SAVED VERSION'));
 assert.ok(source.includes('preview(requested,requestedVersion>0?requestedVersion:undefined)'));
 assert.ok(source.includes('setViewedVersion(versionNumber||0)'));
 assert.ok(source.includes("value={selected?String(viewedVersion||''):''}"));
});
