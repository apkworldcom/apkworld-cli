# Security policy

## Reporting a vulnerability

Do not open a public issue for suspected vulnerabilities, leaked credentials,
download-integrity failures, or ways to bypass access controls.

Report security issues privately through GitHub's **Security** tab using a
private vulnerability report. Include affected versions, reproduction steps,
impact, and any suggested mitigation.

Do not include live credentials, private user data, or third-party APK binaries
in a report unless explicitly requested through the private channel.

## Supported versions

Until the first stable release, only the latest commit on the default branch is
supported.

## Project boundary

The public CLI must never include production credentials, proxy lists, token
minting, anti-bot bypasses, private storage locations, or APKWorld upstream
acquisition logic. Please report any accidental exposure immediately.
