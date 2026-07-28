import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { downloadFile, sha256File } from "../src/download.js";
import { withServer } from "./helpers.js";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("computes a streaming SHA-256 digest", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "apkworld-cli-"));
  const filename = path.join(directory, "sample.apk");
  try {
    const body = Buffer.alloc(1024 * 1024, 0x41);
    await writeFile(filename, body);
    assert.equal(
      await sha256File(filename),
      digest(body),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("downloads atomically and verifies the advertised digest", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "apkworld-cli-"));
  const destination = path.join(directory, "sample.apk");
  const body = Buffer.from("sample apk bytes");
  try {
    await withServer(
      (_request, response) => {
        response.writeHead(200, {
          "content-type": "application/vnd.android.package-archive",
          "content-length": body.length,
          "x-apk-sha256": digest(body),
          "x-apk-version-code": "42",
          "x-apk-file-type": "apk",
        });
        response.end(body);
      },
      async (origin) => {
        const result = await downloadFile(`${origin}/sample.apk`, destination, {
          allowInsecure: true,
        });
        assert.equal(result.verified, true);
        assert.equal(result.sha256, digest(body));
        assert.equal(result.versionCode, "42");
        assert.deepEqual(await readFile(destination), body);
        assert.deepEqual(await readdir(directory), ["sample.apk"]);
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses to overwrite an existing destination before making a request", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "apkworld-cli-"));
  const destination = path.join(directory, "existing.apk");
  let requests = 0;
  try {
    await writeFile(destination, "keep me");
    await withServer(
      (_request, response) => {
        requests += 1;
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.end("replacement");
      },
      async (origin) => {
        await assert.rejects(
          downloadFile(`${origin}/sample.apk`, destination, { allowInsecure: true }),
          /Refusing to overwrite/,
        );
      },
    );
    assert.equal(requests, 0);
    assert.equal(await readFile(destination, "utf8"), "keep me");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("resolves concurrent destination races without overwriting", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "apkworld-cli-"));
  const destination = path.join(directory, "race.apk");
  const body = Buffer.from("same bytes");
  try {
    await withServer(
      (_request, response) => {
        response.writeHead(200, {
          "content-type": "application/octet-stream",
          "x-apk-sha256": digest(body),
        });
        response.end(body);
      },
      async (origin) => {
        const outcomes = await Promise.allSettled([
          downloadFile(`${origin}/one`, destination, { allowInsecure: true }),
          downloadFile(`${origin}/two`, destination, { allowInsecure: true }),
        ]);
        assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
        assert.equal(outcomes.filter(({ status }) => status === "rejected").length, 1);
      },
    );
    assert.deepEqual(await readFile(destination), body);
    assert.deepEqual(await readdir(directory), ["race.apk"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("removes partial files after digest, type, header, and size failures", async () => {
  const cases = [
    {
      headers: {
        "content-type": "application/octet-stream",
        "x-apk-sha256": "0".repeat(64),
      },
      body: "bytes",
      options: {},
      expected: /SHA-256 mismatch/,
    },
    {
      headers: { "content-type": "text/html" },
      body: "<html>not an apk</html>",
      options: {},
      expected: /Unexpected download content type/,
    },
    {
      headers: {
        "content-type": "application/octet-stream",
        "x-apk-sha256": "invalid",
      },
      body: "bytes",
      options: {},
      expected: /invalid SHA-256/,
    },
    {
      headers: {
        "content-type": "application/octet-stream",
        "x-apk-version-code": "not-a-version",
      },
      body: "bytes",
      options: {},
      expected: /invalid version-code/,
    },
    {
      headers: {
        "content-type": "application/octet-stream",
        "x-apk-file-type": "html",
      },
      body: "bytes",
      options: {},
      expected: /invalid file-type/,
    },
    {
      headers: { "content-type": "application/octet-stream" },
      body: "",
      options: {},
      expected: /Content-Length|empty file/,
    },
    {
      headers: { "content-type": "application/octet-stream" },
      body: "too many bytes",
      options: { maxBytes: 4 },
      expected: /size limit/,
    },
  ];

  for (const [index, failure] of cases.entries()) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "apkworld-cli-"));
    const destination = path.join(directory, `${index}.apk`);
    try {
      await withServer(
        (_request, response) => {
          response.writeHead(200, failure.headers);
          response.end(failure.body);
        },
        async (origin) => {
          await assert.rejects(
            downloadFile(`${origin}/sample.apk`, destination, {
              allowInsecure: true,
              ...failure.options,
            }),
            failure.expected,
          );
        },
      );
      assert.deepEqual(await readdir(directory), []);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});
