import test from "node:test";
import assert from "node:assert/strict";
import { lookupApp, openDownload, validateLookupResult } from "../src/api.js";
import { withServer } from "./helpers.js";

const VALID_LOOKUP = {
  region: "us",
  regionLabel: "United States",
  app: {
    appId: "com.example.app",
    title: "Example",
    developer: "Example developer",
    version: "1.0",
  },
  download: {
    available: true,
    fileType: "apk",
    versionCode: 1,
    downloadUrl: "/download",
  },
};

test("validates lookup response structure and package identity", () => {
  assert.equal(validateLookupResult(VALID_LOOKUP, "com.example.app"), VALID_LOOKUP);
  assert.throws(
    () => validateLookupResult(VALID_LOOKUP, "com.other.app"),
    /invalid lookup response/,
  );
  assert.throws(
    () => validateLookupResult({ ...VALID_LOOKUP, download: { available: true } }, "com.example.app"),
    /incomplete download metadata/,
  );
});

test("accepts a bounded JSON lookup response", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(VALID_LOOKUP));
    },
    async (origin) => {
      const result = await lookupApp("com.example.app", { origin });
      assert.equal(result.app.title, "Example");
    },
  );
});

test("rejects malformed, oversized, and wrong-type lookup responses", async () => {
  for (const responseCase of [
    { type: "text/html", body: JSON.stringify(VALID_LOOKUP), expected: /unexpected lookup response type/ },
    { type: "application/json", body: "{", expected: /malformed JSON/ },
    { type: "application/json", body: `"${"x".repeat(1_000_001)}"`, expected: /exceeded/ },
  ]) {
    await withServer(
      (_request, response) => {
        response.writeHead(200, { "content-type": responseCase.type });
        response.end(responseCase.body);
      },
      async (origin) => {
        await assert.rejects(lookupApp("com.example.app", { origin }), responseCase.expected);
      },
    );
  }
});

test("rejects insecure download URLs unless explicitly limited to localhost tests", async () => {
  await assert.rejects(openDownload("http://example.com/file.apk"), /must use HTTPS/);
});

test("follows bounded redirects without allowing an HTTPS downgrade", async () => {
  await withServer(
    (request, response) => {
      if (request.url === "/start") {
        response.writeHead(302, { location: "/file.apk" });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end("apk");
    },
    async (origin) => {
      const response = await openDownload(`${origin}/start`, { allowInsecure: true });
      assert.equal(await response.text(), "apk");
    },
  );

  await withServer(
    (_request, response) => {
      response.writeHead(302, { location: "http://example.com/file.apk" });
      response.end();
    },
    async (origin) => {
      await assert.rejects(
        openDownload(`${origin}/start`, { allowInsecure: true }),
        /redirected to an insecure URL/,
      );
    },
  );
});

test("rejects redirect loops after five hops", async () => {
  await withServer(
    (_request, response) => {
      response.writeHead(302, { location: "/again" });
      response.end();
    },
    async (origin) => {
      await assert.rejects(
        openDownload(`${origin}/again`, { allowInsecure: true }),
        /redirect limit/,
      );
    },
  );
});
