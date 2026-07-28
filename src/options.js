const PACKAGE_RE = /^(?:[a-zA-Z0-9_]+\.)+[a-zA-Z0-9_]+$/;

export function packageIdFrom(value) {
  const input = String(value ?? "").trim();
  if (PACKAGE_RE.test(input)) return input;

  try {
    const url = new URL(input);
    if (url.hostname !== "play.google.com") return null;
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

  while (args.length) {
    const token = args.shift();
    if (!token?.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawName, inlineValue] = token.slice(2).split("=", 2);
    if (rawName === "json" || rawName === "help") {
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
  return String(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}
