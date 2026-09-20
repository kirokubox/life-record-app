import assert from "node:assert/strict";
import test from "node:test";
import { createZipBlob, readZipEntries } from "../src/zip.js";

test("写真つき完全バックアップ用ZIPを往復できる", async () => {
  const files = [
    { path: "life-record-backup.json", blob: new Blob([JSON.stringify({ appName: "Life Record App" })]) },
    { path: "photos/2026-09-20/sample.webp", blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" }) },
  ];
  const zip = await createZipBlob(files, new Date("2026-09-20T00:00:00Z"));
  const restored = await readZipEntries(zip);
  assert.deepEqual(restored.map((entry) => entry.path), files.map((file) => file.path));
  assert.equal(await restored[0].blob.text(), JSON.stringify({ appName: "Life Record App" }));
  assert.deepEqual([...new Uint8Array(await restored[1].blob.arrayBuffer())], [1, 2, 3, 4]);
});
