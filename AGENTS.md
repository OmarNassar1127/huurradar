# AGENTS.md

Orientation for AI coding agents working in this repo. Humans want
[CONTRIBUTING.md](./CONTRIBUTING.md) and [ARCHITECTURE.md](./ARCHITECTURE.md);
this file is the short version plus the things that break quietly.

## What this is

A self-hosted Node service that scrapes six Dutch rental platforms on a cron,
filters listings against per-platform criteria, optionally asks Gemini to read
the income requirements, emails the survivors, and can auto-apply. Express +
SQLite + a vanilla-JS dashboard. No build step, no bundler, no TypeScript.

## Commands

```bash
npm install
cp .env.example .env      # SEARCH_AREAS is the only required field
npm start                 # → http://127.0.0.1:3000
npm run dev               # node --watch
```

While developing, set `SCRAPE_INTERVAL_MINUTES` high and
`MAX_PAGES_PER_PLATFORM=1`. There is no test suite; you verify against the real
sites, so keep the volume down.

## Where things live

```
index.js              express app, cron schedule, route wiring
scrapers/base.js      criteria + special addresses (single source of truth)
scrapers/index.js     orchestration: fetch → tag → dedupe → notify → archive
scrapers/platforms/   one adapter file per site
services/             ai, autoapply, captcha, database, email, auth, cache
routes/               REST API, all behind auth
public/               the dashboard
```

## Invariants

These are the ones that fail silently. Breaking any of them produces a service
that still starts, still logs success, and is wrong.

**`totalRooms` includes the living room.** A site that prints bedrooms needs
`bedrooms + 1`. Get it wrong and that one platform is quietly stricter or looser
than the other five.

**`0` means unknown, not zero.** If a site does not print a figure, leave it `0`.
The filter treats unknown as a pass, deliberately, because dropping a listing
over a missing field is worse than showing one extra.

**Criteria live in `scrapers/base.js` and nowhere else.** They used to also live
in `platforms/filter.js`, the two drifted, and listings were filtered
differently depending on the path. `filter.js` does deduplication only now. Do
not add a matching rule to it.

**`PLATFORMS` in `services/database.js` is one list.** Seeding a fresh database
and backfilling an upgrading one both read it. There were two lists once and
they diverged, so upgraders inherited someone else's search criteria.

**Do not remove the pacing.** Adapters run sequentially, with delays between
pages and areas. These are other people's servers. A change that makes the
scraper faster by removing sleeps will be rejected.

**Auto-apply submits a real application to a real letting agent.** It is off
unless `CAPTCHA_API_KEY` is set. Never enable it to test a change, and never
point it at a live listing you are not actually applying for.

**Never write API keys to the database.** They are read from the environment.
The Settings page reports whether a key is set, never its value.

## Verifying a change

There is no CI that can tell you a parser works, because that depends on a
third-party site's current markup. Do it directly:

```js
const { parseFundaListings } = require('./scrapers/platforms/adapters/funda');
console.log(parseFundaListings(html).length);
```

Then run the app and read the **Live View**, which shows what each platform
fetched and why anything was dropped. A platform sitting at `0` is either
genuinely empty for that area or broken, and that page is how you tell.

When you fix a parser, anchor on a `data-testid`, a semantic element or a URL
shape. Never on a Tailwind class string. Read stats by shape, not by index: a
house adds a plot-area entry to the same list an apartment uses for living area
alone, so "the first m² value" is correct and "index 0" is a coin flip.

## Do not

- Commit `.env`, `data/`, or any real address, income or applicant profile.
- Add a config knob because one site is unusual. Map onto the shared criteria.
- Introduce a build step, TypeScript, or a framework. It runs from source on
  purpose.
- Import your own HTTP client in an adapter. Use `ctx.http`, `ctx.logger` and
  `ctx.delay` so timeouts, user agent and pacing stay consistent.
- Let one platform's failure fail the run. Mark it errored, carry on.
