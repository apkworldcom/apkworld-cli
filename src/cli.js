#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { DEFAULT_ORIGIN, lookupApp } from "./api.js";
import { downloadFile, sha256File } from "./download.js";
import { packageIdFrom, parseArgs, safeFilename } from "./options.js";

const VERSION = "0.1.0";

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
  --proxy <url>            Optional user-supplied HTTP/SOCKS proxy
  --origin <url>           API origin (default: https://apkworld.com)
  --json                   Print machine-readable JSON
  --help                   Show help

Examples:
  apkworld lookup com.whatsapp
  apkworld download "https://play.google.com/store/apps/details?id=com.whatsapp"
  apkworld verify ./app.apk --sha256 <expected-digest>

This client does not provide proxy lists, rotate identities, bypass access
controls, or access paid/restricted applications.`);
}

function normalizedOptions(options) {
  return {
    version: options.version ?? "latest",
    region: options.region,
    lang: options.lang,
    proxy: options.proxy ?? process.env.HTTPS_PROXY ?? process.env.https_proxy,
    origin: options.origin ?? DEFAULT_ORIGIN,
  };
}

function printLookup(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${result.app.title} (${result.app.appId})`);
  console.log(`Developer: ${result.app.developer || "Unknown"}`);
  console.log(`Store version: ${result.app.version || "Unknown"}`);
  console.log(`Region: ${result.regionLabel || result.region}`);
  if (result.download?.available) {
    console.log(`Download: available (${result.download.fileType}, version ${result.download.versionCode})`);
  } else {
    console.log(`Download: unavailable${result.download?.message ? ` — ${result.download.message}` : ""}`);
  }
}

async function main() {
  const { command, positionals, options } = parseArgs(process.argv.slice(2));
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

  if (command !== "lookup" && command !== "download") {
    throw new Error(`Unknown command: ${command}. Run "apkworld help".`);
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

  const downloadUrl = new URL(result.download.downloadUrl, requestOptions.origin).toString();
  const extension = result.download.fileType === "xapk" ? "xapk" : "apk";
  const defaultName = safeFilename(
    `${packageId}-${result.download.versionCode}.${extension}`,
  );
  const destination = path.resolve(String(options.output ?? defaultName));
  const downloaded = await downloadFile(downloadUrl, destination, requestOptions);
  const output = { app: result.app, download: downloaded };
  if (options.json) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(`Saved: ${downloaded.destination}`);
    console.log(`Bytes: ${downloaded.bytes}`);
    console.log(`SHA-256: ${downloaded.sha256}${downloaded.verified ? " (verified)" : ""}`);
  }
}

main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
