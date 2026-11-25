# Security Policy

## Supported versions

Security fixes are applied to the latest `0.2.x` release.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected version, reproduction steps, impact and any suggested fix.

If private reporting is unavailable, contact the maintainers through the address listed on the repository profile. Do not include real user data, API keys or production credentials in the report.

## Scope

In scope:

- Authentication and authorization bypasses
- Cross-user or cross-canvas data access
- Secret leakage in the repository or build output
- Server-side request forgery, injection and unsafe file handling
- Denial of service that is cheap to trigger

Out of scope:

- Findings that require a compromised local machine or browser extension
- Missing security headers without a demonstrated impact
- Rate-limit suggestions without a reproducible abuse scenario

## Secrets and BYOK

- User AI keys are stored encrypted at rest. Never commit `.env`, `.env.local`, service-role keys or database passwords.
- If a key is exposed, rotate it at the provider first, then update the encrypted value in the database or environment.
- The public repository must stay clean of real credentials. Run a secret scan before every release.

## Response

We aim to acknowledge reports within a few days, agree on a disclosure timeline, and credit reporters who want to be credited. Please give us a reasonable window to ship a fix before public disclosure.
