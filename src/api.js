import { ProxyAgent } from "undici";

export const DEFAULT_ORIGIN = "https://apkworld.com";
const MAX_JSON_BYTES = 1_000_000;
const MAX_ERROR_BYTES = 8_192;

export function requestDispatcher(proxy) {
  return proxy ? new ProxyAgent(proxy) : undefined;
}

async function readLimited(response, maximumBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = "";
  let bytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        throw new Error(`Response exceeded the ${maximumBytes}-byte limit.`);
      }
      output += decoder.decode(value, { stream: true });
    }
    return output + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function cleanMessage(value, fallback) {
  const message = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return message || fallback;
}

async function errorFrom(response) {
  let text;
  try {
    text = await readLimited(response, MAX_ERROR_BYTES);
  } catch {
    return `HTTP ${response.status}`;
  }
  try {
    const parsed = JSON.parse(text);
    return cleanMessage(parsed.error || parsed.message, `HTTP ${response.status}`);
  } catch {
    return cleanMessage(text, `HTTP ${response.status}`);
  }
}

function apiUrl(origin, pathname) {
  const url = new URL(pathname, origin);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("API origin must use HTTPS.");
  }
  return url;
}

export function validateLookupResult(value, expectedPackageId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("APKWorld returned an invalid lookup response.");
  }
  const app = value.app;
  const download = value.download;
  if (
    !app ||
    typeof app !== "object" ||
    app.appId !== expectedPackageId ||
    typeof app.title !== "string" ||
    !download ||
    typeof download !== "object" ||
    typeof download.available !== "boolean"
  ) {
    throw new Error("APKWorld returned an invalid lookup response.");
  }
  if (download.available) {
    if (
      typeof download.downloadUrl !== "string" ||
      !download.downloadUrl ||
      !["apk", "xapk"].includes(download.fileType) ||
      !Number.isSafeInteger(Number(download.versionCode)) ||
      Number(download.versionCode) <= 0
    ) {
      throw new Error("APKWorld returned incomplete download metadata.");
    }
  }
  return value;
}

export async function lookupApp(input, options = {}) {
  const origin = String(options.origin ?? DEFAULT_ORIGIN).replace(/\/$/, "");
  const response = await fetch(apiUrl(origin, "/api/apk-lookup"), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": options.userAgent ?? "apkworld-cli/0.1.0",
    },
    body: JSON.stringify({
      input,
      version: options.version ?? "latest",
      region: options.region,
      lang: options.lang,
    }),
    dispatcher: requestDispatcher(options.proxy),
    signal: AbortSignal.timeout(options.timeout ?? 60_000),
  });

  if (!response.ok) throw new Error(await errorFrom(response));
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/(?:[\w.+-]*\+)?json(?:;|$)/i.test(contentType)) {
    throw new Error("APKWorld returned an unexpected lookup response type.");
  }

  let parsed;
  try {
    parsed = JSON.parse(await readLimited(response, MAX_JSON_BYTES));
  } catch (error) {
    if (error instanceof Error && error.message.includes("exceeded")) throw error;
    throw new Error("APKWorld returned malformed JSON.");
  }
  return validateLookupResult(parsed, input);
}

export async function openDownload(url, options = {}) {
  let requested = new URL(url);
  const dispatcher = requestDispatcher(options.proxy);
  const signal = AbortSignal.timeout(options.timeout ?? 300_000);
  const allowInsecure =
    options.allowInsecure === true &&
    (requested.hostname === "127.0.0.1" || requested.hostname === "localhost");

  function assertSafeUrl(candidate, redirected = false) {
    const localHttp =
      candidate.protocol === "http:" &&
      allowInsecure &&
      (candidate.hostname === "127.0.0.1" || candidate.hostname === "localhost");
    if (candidate.protocol !== "https:" && !localHttp) {
      throw new Error(redirected ? "Download redirected to an insecure URL." : "Download URL must use HTTPS.");
    }
  }

  assertSafeUrl(requested);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(requested, {
      redirect: "manual",
      headers: {
        accept: "application/vnd.android.package-archive,application/octet-stream",
        "user-agent": options.userAgent ?? "apkworld-cli/0.1.0",
      },
      dispatcher,
      signal,
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Download redirect did not include a destination.");
      if (redirects === 5) throw new Error("Download exceeded the redirect limit.");
      requested = new URL(location, requested);
      assertSafeUrl(requested, true);
      continue;
    }

    if (!response.ok) throw new Error(await errorFrom(response));
    return response;
  }
  throw new Error("Download exceeded the redirect limit.");
}
