# APKWorld CLI

An open-source APK downloader and XAPK downloader for the command line. Look
up, download, and verify Android packages made available by
[APKWorld](https://apkworld.com).

The CLI verifies downloaded files against the SHA-256 digest returned by
APKWorld.

## Features

- Download available APK and XAPK packages by Android package ID.
- Accept Google Play details URLs as input.
- Select a version and APKWorld download region.
- Verify downloaded files with streaming SHA-256 checksums.
- Produce human-readable or JSON output for scripts and automation.

## Requirements

- Node.js 20.18.1 or newer
- An internet connection

## Install from source

```bash
git clone https://github.com/apkworldcom/apkworld-cli.git
cd apkworld-cli
npm install
npm link
```

## Usage

Look up an application:

```bash
apkworld lookup com.whatsapp
```

Google Play details URLs are accepted:

```bash
apkworld lookup \
  "https://play.google.com/store/apps/details?id=com.whatsapp"
```

Download the latest available package:

```bash
apkworld download com.whatsapp
```

Choose a destination or version:

```bash
apkworld download com.whatsapp --version latest --output ./whatsapp.apk
```

Print JSON:

```bash
apkworld lookup com.whatsapp --json
```

Verify a local file:

```bash
apkworld verify ./application.apk --sha256 <expected-sha256>
```

## Proxy support

For ordinary corporate, development, or privacy network routing, provide one
proxy you control:

```bash
apkworld lookup com.example.app --proxy http://127.0.0.1:8080
```

HTTP and HTTPS proxy URLs are supported. Proxy use is explicit for each command;
the CLI does not read proxy settings from environment variables.

## Integrity model

When APKWorld supplies an `X-APK-Sha256` header, the client hashes the file as
it streams to disk. A mismatch deletes the partial download and returns an
error. Partial files are removed after a failed transfer, and an existing
destination is never overwritten. Downloads are limited to 4 GiB by default.
A successful output explicitly reports whether a server digest was available
and verified.

Checksum verification proves that the received bytes match the digest supplied
by APKWorld. It does not, by itself, prove that an application is safe or
endorsed by its developer.

## Responsible use

Use this software only for applications you are authorized to obtain and use.
Application licenses and local law still apply. Do not use it to bypass
authentication, payment, geographic restrictions, technical protections, or
service rate limits.

APKWorld CLI is not affiliated with Google or individual application
developers. The software license for this repository does not grant rights to
any downloaded application.

## Development

```bash
npm install
npm run check
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) before
opening a contribution or reporting a vulnerability.

## License

Licensed under the [Apache License 2.0](LICENSE).
