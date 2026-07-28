# APKWorld CLI

An open-source command-line client for looking up, downloading, and verifying
Android packages made available by [APKWorld](https://apkworld.com).

The CLI verifies downloaded files against the SHA-256 digest returned by the
APKWorld download service. It does not contain APKWorld's upstream acquisition
logic, credentials, proxy pools, or storage infrastructure.

> **Private preview:** This project is under active review and is not ready for
> production use or public redistribution yet.

## Requirements

- Node.js 20.18 or newer
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

`HTTPS_PROXY` is also recognized. This project deliberately does not distribute
proxy lists, rotate identities, evade rate limits, bypass access controls, or
download paid/restricted applications.

## Integrity model

When APKWorld supplies an `X-APK-Sha256` header, the client hashes the file as
it streams to disk. A mismatch deletes the partial download and returns an
error. A successful output explicitly reports whether a server digest was
available and verified.

Checksum verification proves that the received bytes match the digest supplied
by APKWorld. It does not, by itself, prove that an application is safe or
endorsed by its developer.

## Responsible use

Use this software only for applications you are authorized to obtain and use.
Application licenses and local law still apply. Do not use it to bypass
authentication, payment, geographic restrictions, technical protections, or
service rate limits.

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
