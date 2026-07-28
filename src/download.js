import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { openDownload } from "./api.js";

export async function sha256File(filename) {
  const { createReadStream } = await import("node:fs");
  const hash = createHash("sha256");
  await pipeline(createReadStream(filename), new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback();
    },
  }));
  return hash.digest("hex");
}

export async function downloadFile(url, destination, options = {}) {
  const response = await openDownload(url, options);
  if (!response.body) throw new Error("The download response contained no body.");

  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  const hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      meter,
      createWriteStream(temporary, { flags: "w", mode: 0o644 }),
    );
    const sha256 = hash.digest("hex");
    const expectedSha256 = (response.headers.get("x-apk-sha256") ?? "").toLowerCase();
    if (expectedSha256 && sha256 !== expectedSha256) {
      throw new Error(`SHA-256 mismatch: expected ${expectedSha256}, received ${sha256}`);
    }
    await rename(temporary, destination);
    return {
      destination,
      bytes,
      sha256,
      expectedSha256: expectedSha256 || null,
      verified: Boolean(expectedSha256),
      versionCode: response.headers.get("x-apk-version-code"),
      fileType: response.headers.get("x-apk-file-type"),
    };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
