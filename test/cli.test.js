import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CLI = new URL("../src/cli.js", import.meta.url);

async function run(args) {
  try {
    const result = await execFileAsync(process.execPath, [CLI.pathname, ...args], {
      env: { PATH: process.env.PATH },
      timeout: 10_000,
    });
    return { ...result, code: 0 };
  } catch (error) {
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      code: error.code,
    };
  }
}

test("prints help and version without network access", async () => {
  const help = await run(["help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /APKWorld CLI/);
  const version = await run(["version"]);
  assert.equal(version.code, 0);
  const packageMetadata = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(version.stdout.trim(), packageMetadata.version);
});

test("rejects unknown, misplaced, and duplicate options", async () => {
  for (const args of [
    ["lookup", "com.example.app", "--unknown", "value"],
    ["verify", "file.apk", "--proxy", "http://127.0.0.1:8080"],
    ["lookup", "com.example.app", "--region", "us", "--region", "gb"],
    ["lookup", "com.example.app", "extra"],
  ]) {
    const result = await run(args);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /^Error:/);
  }
});

test("redacts credentials from unexpected error output", async () => {
  const result = await run([
    "lookup",
    "com.example.app",
    "--proxy",
    "http://username:password@127.0.0.1:1",
  ]);
  assert.equal(result.code, 1);
  assert.doesNotMatch(result.stderr, /username|password/);
});
