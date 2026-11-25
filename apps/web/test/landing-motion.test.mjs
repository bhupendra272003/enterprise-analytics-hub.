import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
test("landing canvas respects reduced-motion by disabling parallax and RAF loop",()=>{
 assert.match(source,/if\(reduced\)return;mx=/);
 assert.match(source,/if\(!reduced\)raf=requestAnimationFrame\(draw\)/);
});
