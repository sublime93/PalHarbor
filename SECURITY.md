# Security policy

## Supported versions

Security fixes are provided for the latest tagged release and the current
`main` branch. Older releases may be asked to upgrade before a fix is issued.

## Report a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private vulnerability reporting feature for this repository. Include the
affected version, deployment configuration, reproduction steps, impact, and
any suggested mitigation.

You should receive an acknowledgement within seven days. Confirmed reports
will be coordinated privately until a fix and disclosure plan are ready.

## Deployment boundary

PalHarbor controls a Palworld dedicated server and handles player identifiers,
connection metadata, and administrator credentials. Keep PalHarbor and the
Palworld REST API on localhost, a trusted network, or a VPN. Remote listeners
must use PalHarbor authentication or an authenticated reverse proxy.
