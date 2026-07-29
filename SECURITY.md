# Security

## Reporting a vulnerability

Open a [security advisory](https://github.com/OmarNassar1127/huurradar/security/advisories/new)
rather than a public issue. I will confirm within a few days.

This is a personal project, not a funded one: expect a best-effort fix, not an
SLA.

## What this software is

Self-hosted, single-tenant, and designed to bind to loopback. It has **no TLS
and no rate limiting**. It is not hardened for exposure to the open internet.

If you put it behind a tunnel or a reverse proxy, put authentication in front of
it too.

## What it holds

Assume the database is sensitive. It contains your search criteria, your
addresses, your notification recipients, and depending on what you configure,
your income and your household details.

- It is a plain SQLite file. Anyone with filesystem access can read it.
- Back it up. Do not commit it.
- Passwords are hashed; sessions are opaque ids validated server-side, so
  deleting a session row revokes it immediately.
- API keys are read from the environment and are never written to the database.

## Scope

In scope: authentication bypass, injection, anything that exposes one user's
data to another, and any path that leaks an API key.

Out of scope: the lack of TLS, the lack of rate limiting, and anything that
requires filesystem access to the machine. Those are properties of a
self-hosted single-user app, documented above, not bugs.
