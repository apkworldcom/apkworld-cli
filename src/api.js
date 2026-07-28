import { ProxyAgent } from "undici";

export const DEFAULT_ORIGIN = "https://apkworld.com";

export function requestDispatcher(proxy) {
  return proxy ? new ProxyAgent(proxy) : undefined;
}

async function errorFrom(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed.error || parsed.message || `HTTP ${response.status}`;
  } catch {
    return text.trim() || `HTTP ${response.status}`;
  }
}

export async function lookupApp(input, options = {}) {
  const origin = String(options.origin ?? DEFAULT_ORIGIN).replace(/\/$/, "");
  const response = await fetch(`${origin}/api/apk-lookup`, {
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
  return response.json();
}

export async function openDownload(url, options = {}) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "application/vnd.android.package-archive,application/octet-stream",
      "user-agent": options.userAgent ?? "apkworld-cli/0.1.0",
    },
    dispatcher: requestDispatcher(options.proxy),
    signal: AbortSignal.timeout(options.timeout ?? 300_000),
  });

  if (!response.ok) throw new Error(await errorFrom(response));
  return response;
}
