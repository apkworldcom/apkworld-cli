const PACKAGE_RE = /^(?:[a-zA-Z0-9_]+\.)+[a-zA-Z0-9_]+$/;
const WINDOWS_RESERVED_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function packageIdFrom(value) {
  const input = String(value ?? "").trim();
  if (!input || input.length > 2_048) return null;
  if (PACKAGE_RE.test(input)) return input;

  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "play.google.com" ||
      !/^\/store\/(?:apps|games)\/details\/?$/.test(url.pathname)
    ) {
      return null;
    }
    const packageId = url.searchParams.get("id") ?? "";
    return PACKAGE_RE.test(packageId) ? packageId : null;
  } catch {
    return null;
  }
}

export function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() ?? "help";
  const positionals = [];
  const options = {};
  let optionsEnded = false;

  while (args.length) {
    const token = args.shift();
    if (token === "--" && !optionsEnded) {
      optionsEnded = true;
      continue;
    }
    if (optionsEnded || !token?.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawName, inlineValue] = token.slice(2).split("=", 2);
    if (!/^[a-z][a-z0-9-]*$/.test(rawName)) {
      throw new Error(`Invalid option: ${token}`);
    }
    if (Object.hasOwn(options, rawName)) {
      throw new Error(`Option --${rawName} was provided more than once.`);
    }
    if (rawName === "json" || rawName === "help") {
      if (inlineValue !== undefined) {
        throw new Error(`Option --${rawName} does not accept a value.`);
      }
      options[rawName] = true;
      continue;
    }

    const value = inlineValue ?? args.shift();
    if (!value || value.startsWith("--")) {
      throw new Error(`Option --${rawName} requires a value.`);
    }
    options[rawName] = value;
  }

  return { command, positionals, options };
}

export function safeFilename(value) {
  let filename = String(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/-+$/g, "")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);
  if (!filename) filename = "download.apk";
  if (WINDOWS_RESERVED_RE.test(filename)) filename = `_${filename}`;
  return filename;
}

export function validateProxyUrl(value) {
  if (value === undefined) return undefined;
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error("Proxy must be a valid HTTP or HTTPS URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Proxy must use the http: or https: protocol.");
  }
  if (!url.hostname || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Proxy URL must contain only a host, optional port, and optional credentials.");
  }
  return url.toString();
}

export function validateVersion(value) {
  const version = String(value ?? "latest").trim();
  if (version !== "latest" && !/^[1-9][0-9]{0,18}$/.test(version)) {
    throw new Error("Version must be \"latest\" or a positive numeric version code.");
  }
  return version;
}
