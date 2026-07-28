#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { DEFAULT_ORIGIN, lookupApp } from "./api.js";
import { downloadFile, sha256File } from "./download.js";
import {
  packageIdFrom,
  parseArgs,
  safeFilename,
  validateProxyUrl,
  validateVersion,
} from "./options.js";

const VERSION = "0.1.0";
const REGIONS = new Set(["us", "gb", "de", "fr", "ca", "au", "in", "jp", "br", "mx", "es", "it"]);
const OPTIONS_BY_COMMAND = {
  lookup: new Set(["version", "region", "lang", "proxy", "json", "help"]),
  download: new Set(["version", "region", "lang", "proxy", "output", "json", "help"]),
  verify: new Set(["sha256", "json", "help"]),
  help: new Set(["help"]),
  version: new Set(),
};

function help() {
  console.log(`APKWorld CLI ${VERSION}

Usage:
  apkworld lookup <package-or-play-url> [options]
  apkworld download <package-or-play-url> [options]
  apkworld verify <file> --sha256 <digest>

Options:
  --version <code|latest>  Version to resolve (default: latest)
  --region <id>            APKWorld download region
  --lang <code>            Metadata language
  --output <path>          Download destination
  --proxy <url>            Optional user-supplied HTTP or HTTPS proxy
  --json                   Print machine-readable JSON
  --help                   Show help

Examples:
  apkworld lookup com.whatsapp
  apkworld download "https://play.google.com/store/apps/details?id=com.whatsapp"
  apkworld verify ./app.apk --sha256 <expected-digest>

Only download applications that you are authorized to obtain and use.`);
}

function validateInvocation(command, positionals, options) {
  const allowed = OPTIONS_BY_COMMAND[command];
  if (!allowed) throw new Error(`Unknown command: ${command}. Run "apkworld help".`);
  for (const option of Object.keys(options)) {
    if (!allowed.has(option)) throw new Error(`Option --${option} is not valid for ${command}.`);
  }
  const expectedPositionals = command === "help" || command === "version" ? 0 : 1;
  if (positionals.length > expectedPositionals) {
    throw new Error(`Unexpected argument: ${positionals[expectedPositionals]}`);
  }
}

function normalizedOptions(options) {
  const region = options.region?.toLowerCase();
  if (region && !REGIONS.has(region)) {
    throw new Error(`Unsupported region: ${options.region}`);
  }
  const lang = options.lang?.toLowerCase();
  if (lang && !/^[a-z]{2,3}(?:-[a-z]{2})?$/.test(lang)) {
    throw new Error("Language must be a two- or three-letter code with an optional region.");
  }
  return {
    version: validateVersion(options.version),
    region,
    lang,
    proxy: validateProxyUrl(options.proxy),
    origin: DEFAULT_ORIGIN,
  };
}

function terminalText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function publicLookupResult(result) {
  return {
    app: {
      packageId: result.app.appId,
      title: result.app.title,
      developer: result.app.developer || null,
      version: result.app.version || null,
    },
    region: {
      id: result.region || null,
      label: result.regionLabel || null,
    },
    download: result.download.available
      ? {
          available: true,
          versionCode: result.download.versionCode,
          fileType: result.download.fileType,
          sizeBytes: Number.isSafeInteger(Number(result.download.sizeBytes))
            ? Number(result.download.sizeBytes)
            : null,
        }
      : {
          available: false,
          message: result.download.message || null,
        },
  };
}

function printLookup(result, asJson) {
  const output = publicLookupResult(result);
  if (asJson) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log(`${terminalText(output.app.title)} (${output.app.packageId})`);
  console.log(`Developer: ${terminalText(output.app.developer) || "Unknown"}`);
  console.log(`Store version: ${terminalText(output.app.version) || "Unknown"}`);
  console.log(`Region: ${terminalText(output.region.label || output.region.id)}`);
  if (output.download.available) {
    console.log(
      `Download: available (${output.download.fileType}, version ${output.download.versionCode})`,
    );
  } else {
    const message = terminalText(output.download.message);
    console.log(`Download: unavailable${message ? ` — ${message}` : ""}`);
  }
}

async function main() {
  const { command, positionals, options } = parseArgs(process.argv.slice(2));
  validateInvocation(command, positionals, options);
  if (command === "help" || options.help) return help();
  if (command === "version") return console.log(VERSION);

  if (command === "verify") {
    const filename = positionals[0];
    const expected = String(options.sha256 ?? "").toLowerCase();
    if (!filename || !/^[a-f0-9]{64}$/.test(expected)) {
      throw new Error("Usage: apkworld verify <file> --sha256 <64-character digest>");
    }
    const actual = await sha256File(filename);
    const result = { file: filename, expected, actual, verified: actual === expected };
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.verified ? `Verified: ${actual}` : `Mismatch: expected ${expected}, received ${actual}`);
    if (!result.verified) process.exitCode = 2;
    return;
  }

  const input = positionals[0];
  const packageId = packageIdFrom(input);
  if (!packageId) throw new Error("Provide a valid Android package ID or Google Play details URL.");

  const requestOptions = normalizedOptions(options);
  const result = await lookupApp(packageId, requestOptions);
  if (command === "lookup") return printLookup(result, options.json);

  if (!result.download?.available || !result.download.downloadUrl) {
    throw new Error(result.download?.message || "This package is not available for download.");
  }

  const downloadUrl = new URL(result.download.downloadUrl, DEFAULT_ORIGIN);
  if (downloadUrl.origin !== new URL(DEFAULT_ORIGIN).origin) {
    throw new Error("APKWorld returned an unexpected download origin.");
  }
  const extension = result.download.fileType === "xapk" ? "xapk" : "apk";
  const defaultName = safeFilename(
    `${packageId}-${result.download.versionCode}.${extension}`,
  );
  const destination = path.resolve(String(options.output ?? defaultName));
  const downloaded = await downloadFile(downloadUrl.toString(), destination, requestOptions);
  const output = { app: publicLookupResult(result).app, download: downloaded };
  if (options.json) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(`Saved: ${downloaded.destination}`);
    console.log(`Bytes: ${downloaded.bytes}`);
    console.log(`SHA-256: ${downloaded.sha256}${downloaded.verified ? " (verified)" : ""}`);
  }
}

main().catch((error) => {
  const message = terminalText(error instanceof Error ? error.message : String(error))
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1***@");
  console.error(`Error: ${message || "Unexpected failure."}`);
  process.exitCode = 1;
});
