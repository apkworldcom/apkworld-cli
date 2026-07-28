import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sha256File } from "../src/download.js";

test("computes a streaming SHA-256 digest", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "apkworld-cli-"));
  const filename = path.join(directory, "sample.apk");
  try {
    await writeFile(filename, "APKWorld\n");
    assert.equal(
      await sha256File(filename),
      "853d6070e493b25b2813b37b96078b024db4931911417ad99cd8d20ef66435f2",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
