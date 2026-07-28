import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, lstat, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { openDownload } from "./api.js";

export const DEFAULT_MAX_BYTES = 4 * 1024 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
  "application/vnd.android.package-archive",
  "application/zip",
]);

export async function sha256File(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function assertDestinationAbsent(destination) {
  try {
    await lstat(destination);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Refusing to overwrite existing path: ${destination}`);
}

function responseMetadata(response, maximumBytes) {
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error(`Unexpected download content type: ${contentType || "missing"}`);
  }

  const rawLength = response.headers.get("content-length");
  if (rawLength !== null) {
    const contentLength = Number(rawLength);
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
      throw new Error("Download returned an invalid Content-Length header.");
    }
    if (contentLength > maximumBytes) {
      throw new Error(`Download exceeds the ${maximumBytes}-byte size limit.`);
    }
  }

  const expectedSha256 = (response.headers.get("x-apk-sha256") ?? "").toLowerCase();
  if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error("Download returned an invalid SHA-256 header.");
  }
  const versionCode = response.headers.get("x-apk-version-code");
  if (versionCode !== null && !/^[1-9][0-9]{0,18}$/.test(versionCode)) {
    throw new Error("Download returned an invalid version-code header.");
  }
  const fileType = response.headers.get("x-apk-file-type");
  if (fileType !== null && !["apk", "xapk"].includes(fileType)) {
    throw new Error("Download returned an invalid file-type header.");
  }
  return { expectedSha256, versionCode, fileType };
}

export async function downloadFile(url, destination, options = {}) {
  const resolvedDestination = path.resolve(destination);
  const maximumBytes = Number(options.maxBytes ?? DEFAULT_MAX_BYTES);
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error("Maximum download size must be a positive integer.");
  }

  await mkdir(path.dirname(resolvedDestination), { recursive: true });
  await assertDestinationAbsent(resolvedDestination);

  const response = await openDownload(url, options);
  if (!response.body) throw new Error("The download response contained no body.");
  let expectedSha256;
  let versionCode;
  let fileType;
  try {
    ({ expectedSha256, versionCode, fileType } = responseMetadata(response, maximumBytes));
  } catch (error) {
    await response.body.cancel();
    throw error;
  }

  const temporary = path.join(
    path.dirname(resolvedDestination),
    `.${path.basename(resolvedDestination)}.${process.pid}.${randomUUID()}.part`,
  );
  const hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        callback(new Error(`Download exceeds the ${maximumBytes}-byte size limit.`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      meter,
      createWriteStream(temporary, { flags: "wx", mode: 0o644 }),
    );
    if (bytes === 0) throw new Error("Download returned an empty file.");
    const sha256 = hash.digest("hex");
    if (expectedSha256 && sha256 !== expectedSha256) {
      throw new Error(`SHA-256 mismatch: expected ${expectedSha256}, received ${sha256}`);
    }
    await link(temporary, resolvedDestination);
    await rm(temporary);
    return {
      destination: resolvedDestination,
      bytes,
      sha256,
      expectedSha256: expectedSha256 || null,
      verified: Boolean(expectedSha256),
      versionCode,
      fileType,
    };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
