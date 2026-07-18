# Security Policy

## Supported Versions

MergeVow has not published a runtime release yet. Security fixes currently target the latest commit
on `main`; no older version receives backports.

## Report A Vulnerability

Use [GitHub private vulnerability reporting](https://github.com/datzle123/MergeVow/security/advisories/new).
Do not open a public issue, discussion, or pull request containing exploit details, credentials, or
unsanitized evidence.

Include the affected commit or component, impact, a minimal sanitized reproduction, and any known
mitigation. The solo maintainer aims to acknowledge a report within three business days and provide
a status update within seven business days. These are response targets, not a guaranteed service
level.

## Priority Areas

MergeVow executes candidate application code and processes browser evidence. Token exposure, secret
capture, path traversal, report injection, parser bypass, browser-policy bypass, exact-base oracle
replacement, and CI privilege escalation are high-priority report areas.

GitHub's private report form is a communication channel, not proof that MergeVow provides a security
sandbox. The guarantees and exclusions in [the threat model](docs/THREAT_MODEL.md) remain canonical.
