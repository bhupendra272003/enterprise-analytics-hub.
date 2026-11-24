import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTabularFile } from "../lib/data-import.ts";

test("normalizes JSON row objects into quoted CSV", async () => {
  const input = new File([JSON.stringify([{ name: "Ada", note: "hello, world" }, { name: "Lin", note: 'say "hi"' }])], "people.json", { type: "application/json" });
  const output = await normalizeTabularFile(input);
  assert.equal(output.name, "people.csv");
  assert.equal(output.type, "text/csv");
  assert.equal(await output.text(), 'name,note\r\nAda,"hello, world"\r\nLin,"say ""hi"""');
});

test("normalizes TSV while preserving quoted tabs and line breaks", async () => {
  const input = new File(['name\tnote\r\nAda\t"hello\tworld"\r\nLin\tready'], "people.tsv", { type: "text/tab-separated-values" });
  const output = await normalizeTabularFile(input);
  assert.equal(output.name, "people.csv");
  assert.equal(await output.text(), 'name,note\r\nAda,"hello\tworld"\r\nLin,ready');
});

test("passes CSV through unchanged and rejects invalid or unsupported imports", async () => {
  const csv = new File(["a,b\r\n1,2"], "data.csv", { type: "text/csv" });
  assert.equal(await normalizeTabularFile(csv), csv);
  await assert.rejects(() => normalizeTabularFile(new File(["{"], "broken.json")), /invalid/);
  await assert.rejects(() => normalizeTabularFile(new File(["binary"], "book.xlsx")), /Supported imports/);
});
