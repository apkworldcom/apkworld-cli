import test from "node:test";
import assert from "node:assert/strict";
import {
  packageIdFrom,
  parseArgs,
  safeFilename,
  validateProxyUrl,
  validateVersion,
} from "../src/options.js";

test("accepts package IDs and Play URLs", () => {
  assert.equal(packageIdFrom("com.example.app"), "com.example.app");
  assert.equal(
    packageIdFrom("https://play.google.com/store/apps/details?id=com.example.app&hl=en"),
    "com.example.app",
  );
  assert.equal(packageIdFrom("http://play.google.com/store/apps/details?id=com.example.app"), null);
  assert.equal(packageIdFrom("https://play.google.com/store/books?id=com.example.app"), null);
  assert.equal(packageIdFrom("https://example.com/?id=com.example.app"), null);
  assert.equal(packageIdFrom("not a package"), null);
  assert.equal(packageIdFrom("a".repeat(2_049)), null);
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

test("rejects duplicate, malformed, and valueless options", () => {
  assert.throws(
    () => parseArgs(["lookup", "com.example.app", "--region", "us", "--region", "gb"]),
    /more than once/,
  );
  assert.throws(() => parseArgs(["lookup", "com.example.app", "--bad_name", "x"]), /Invalid option/);
  assert.throws(() => parseArgs(["lookup", "com.example.app", "--json=true"]), /does not accept/);
  assert.throws(() => parseArgs(["lookup", "com.example.app", "--region"]), /requires a value/);
});

test("supports an explicit end-of-options marker", () => {
  assert.deepEqual(parseArgs(["verify", "--sha256", "abc", "--", "--sample.apk"]), {
    command: "verify",
    positionals: ["--sample.apk"],
    options: { sha256: "abc" },
  });
});

test("creates safe output names", () => {
  assert.equal(safeFilename("../../bad app?.apk"), "bad-app-.apk");
  assert.equal(safeFilename("CON.apk"), "_CON.apk");
  assert.equal(safeFilename("..."), "download.apk");
});

test("validates versions and explicit HTTP proxies", () => {
  assert.equal(validateVersion(), "latest");
  assert.equal(validateVersion("123"), "123");
  assert.throws(() => validateVersion("0"), /positive numeric/);
  assert.throws(() => validateVersion("1.2"), /positive numeric/);
  assert.equal(validateProxyUrl("http://user:pass@127.0.0.1:8080"), "http://user:pass@127.0.0.1:8080/");
  assert.throws(() => validateProxyUrl("socks5://127.0.0.1:1080"), /http: or https:/);
  assert.throws(() => validateProxyUrl("https://proxy.example/path"), /only a host/);
});
