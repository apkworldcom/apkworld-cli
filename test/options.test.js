import test from "node:test";
import assert from "node:assert/strict";
import { packageIdFrom, parseArgs, safeFilename } from "../src/options.js";

test("accepts package IDs and Play URLs", () => {
  assert.equal(packageIdFrom("com.example.app"), "com.example.app");
  assert.equal(
    packageIdFrom("https://play.google.com/store/apps/details?id=com.example.app&hl=en"),
    "com.example.app",
  );
  assert.equal(packageIdFrom("https://example.com/?id=com.example.app"), null);
  assert.equal(packageIdFrom("not a package"), null);
});

test("parses positional and named options", () => {
  assert.deepEqual(
    parseArgs(["download", "com.example.app", "--version", "123", "--json"]),
    {
      command: "download",
      positionals: ["com.example.app"],
      options: { version: "123", json: true },
    },
  );
});

test("creates safe output names", () => {
  assert.equal(safeFilename("../../bad app?.apk"), "..-..-bad-app-.apk");
});
