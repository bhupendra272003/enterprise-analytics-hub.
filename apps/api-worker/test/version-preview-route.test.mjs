import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/datasets.ts", import.meta.url), "utf8");

test("version preview route fetches an exact version scoped to its dataset", () => {
  assert.match(source, /versions\\/\\d+\\/preview/);
  assert.match(source, /WHERE dataset_id=\\? AND version_number=\\?/);
  assert.match(source, /Dataset version not found/);
  assert.match(source, /JSON\\.parse\\(version\\.previewJson/);
});
