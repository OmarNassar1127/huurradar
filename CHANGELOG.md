# Changelog

## 1.0.2

- Added screenshots to the README, plus ARCHITECTURE.md, CONTRIBUTING.md and
  SECURITY.md.

## 1.0.1

- Removed duplicated logic. The criteria rule lived in two places
  (`scrapers/base.js` and `platforms/filter.js`) and could drift; `base.js` now
  owns it alone, because it reads per-platform settings from the database.
- Collapsed the scraper seed list and the backfill list into one. They had
  already diverged: a fresh database got neutral defaults while an upgrading one
  got different hardcoded criteria.
- One shared `formatBytes` instead of identical private copies.
- Stripped build-tool boilerplate from the bundled platform adapters. They are
  readable source now, not a generated artifact.
- The sidebar version reads from `package.json` via the API instead of being
  hardcoded, so a release cannot leave it stale.

## 1.0.0

First public release.

- Six platforms behind one adapter interface: Funda, VBT, Bouwinvest, MVGM,
  de Alliantie, Brockhoff. Bundled, no companion package to install.
- Fully config-driven search: areas, radius, per-platform criteria, city
  allowlist. Nothing preconfigured.
- Optional Gemini analysis of a listing's income requirements.
- Email notifications over any SMTP server, with deduplication and auto-archive.
- Optional auto-apply for Brockhoff, off unless a CAPTCHA key is set.
- Web dashboard with a live view of what each scraper fetched and why anything
  was dropped.
- Rewrote the Funda parser for their current markup. The previous selectors
  matched nothing and the platform had been silently returning zero results.
