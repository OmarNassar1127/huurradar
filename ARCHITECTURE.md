# Architecture

How HuurRadar is put together, and why. Read this before changing anything
structural.

## The shape of it

A single Express process. No build step, no bundler, no framework on the
frontend. It holds a SQLite file and a cron schedule, and serves a dashboard as
plain static files.

```
                    ┌──────────────────────────────────────┐
   node-cron ──────▶│  scrapers/index.js                   │
   every N min      │  orchestration                       │
                    └───┬──────────────────────────────────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   platforms/      services/ai.js   services/email.js
   6 adapters      Gemini           SMTP
        │               │                │
        └───────────────┴────────────────┘
                        ▼
                 services/database.js
                 SQLite (WAL)
                        ▲
                        │
   express ─── routes/*.js ─── public/  (vanilla JS dashboard)
```

## Why these choices

**SQLite, not Postgres.** One user, one machine, a few thousand rows. WAL mode
handles the concurrent read during a write. A file you can copy is a better
backup story than a service you have to run.

**No frontend framework.** The dashboard is four JS files and one HTML file
served statically. There is no build step, so `git clone && npm start` works,
and you can edit `public/js/app.js` and hit refresh. For a dashboard this size
a framework would be more code than the app.

**Adapters live in this repo.** They were briefly a separate npm package. That
was worse: a broken scraper needed two releases to fix. One package, one
release.

**Everything is config.** No city, price, address or applicant detail is
hardcoded anywhere. That is not tidiness, it is the difference between a tool
and someone's personal script.

## A scrape run

`scrapers/index.js` is the orchestrator. One run:

1. **Guard.** If a run is already going, return. Scrapes can outlast their
   interval and overlapping runs would double-notify.
2. **Read config.** Enabled platforms from the `scrapers` table, search areas
   from `SEARCH_AREAS`. No areas means no run, with a clear log line.
3. **Fetch, one platform at a time.** Sequential on purpose. Six concurrent
   scrapers is rude and gets you blocked.
4. **Tag every listing** with whether it passed and, if not, which rule
   rejected it: city, price or criteria. Cached for the Live View, so you can
   see what a platform returned and why it vanished.
5. **Persist.** New rows inserted, existing rows updated.
6. **Notify** genuinely new listings that pass. Special addresses skip the AI
   and notify immediately. Everything else goes to Gemini first.
7. **Archive** anything older than 7 days.

A platform that throws is caught, marked errored in the `scrapers` table, and
the run continues. One dead site never costs you the other five.

## Where criteria live

Deliberately in exactly one place: **`scrapers/base.js`**.

It reads per-platform settings from the database, so criteria changed in the UI
apply on the next run with no restart. `platforms/filter.js` deliberately does
*not* contain a copy. There used to be two implementations of this rule and
they drifted.

Two rules worth knowing:

- **A special address bypasses everything.** Matched as a case-insensitive
  substring of the street.
- **`0` means unknown, not zero.** Several platforms pre-filter server-side and
  never print the room count or floor area. Treating a missing value as a
  failure throws away good listings, so unknown passes.

## The platform adapters

`scrapers/platforms/adapters/*.js`, one file per site, all behind one interface:

```js
{
  id: 'funda',
  label: 'Funda',
  site: 'funda.nl',
  requires: [],              // 'coordinates' if lat/lng is mandatory
  async fetch(criteria, ctx) // → Listing[]
}
```

`ctx` supplies the shared axios client, a logger and `delay`. Adapters never
import their own HTTP client, so timeouts, user agent and pacing stay
consistent.

Every site wants its search expressed differently:

| Platform | Search mechanism |
|---|---|
| Funda | Query string, HTML results |
| VBT | JSON API, filter passed as a **cookie** containing JSON |
| Bouwinvest | JSON API, plain query string, paged |
| MVGM | Stateful: two GETs for a session + CSRF, a POST to set the filter, then GETs to page |
| de Alliantie | JSON behind an ASP.NET anti-forgery token scraped off the page first |
| Brockhoff | Every filter encoded into the **URL path**, including `City!lat!lng!radius` |

MVGM and Brockhoff declare `requires: ['coordinates']` and are skipped with a
reason when an area has no lat/lng, rather than silently returning nothing.

**Parsers are exported separately** (`parseFundaListings`, `parseVbtResponse`,
and so on). HTML scraping breaks when a site redesigns, and a parser you can
run against a saved page is the difference between a five-minute fix and an
afternoon.

## Normalisation

Every adapter returns the same `Listing`. Two conversions are easy to get wrong:

- **Rooms are total rooms**, including the living room. Funda and MVGM print
  bedrooms, so those adapters add one. Comparing a raw Funda "3" to a raw VBT
  "3" compares different things.
- **Brockhoff reports the filter floor** for area and rooms, because its
  results page prints neither. Every result is guaranteed to clear the filter,
  so the floor is honest where `0` would be misleading.

## The AI layer

`services/ai.js`, and it is optional. Without `GEMINI_API_KEY` the app still
finds and notifies; it just does not read the fine print.

Two jobs:

**Income analysis.** Fetches the listing page as text and asks what the income
requirements actually are. The result is advisory. `ALWAYS_NOTIFY_MAX_PRICE`
exists because a middenhuur income cap is often negotiable, and a false
negative costs you a home while a false positive costs ten seconds.

**Motivation letters.** Built entirely from `APPLICANT_PROFILE`, which the user
writes. The prompt instructs the model to use only what is in that profile and
to invent nothing, so an omitted detail is absent rather than fabricated. With
no profile set, letter generation throws rather than making something up.

## Auth

Sessions in SQLite, not JWTs. The cookie carries an opaque random token; the
user is looked up server-side per request. Deleting the row revokes the session
instantly. Passwords are hashed in `services/auth.js`.

On first start one account is created, with a generated password printed to the
console unless `HUURRADAR_SEED_PASSWORD` is set.

Every route is behind auth except `/health`, which exposes no data.

## Data

One SQLite file. Schema created and migrated in `services/database.js` at
startup, using `CREATE TABLE IF NOT EXISTS` plus guarded `ALTER TABLE`.

| Table | Holds |
|---|---|
| `houses` | Listings, dedupe key `listing_id`, AI verdict, application state |
| `scrapers` | Per-platform enabled flag, criteria, last run, status, error |
| `recipients` | Notification addresses |
| `special_addresses` | Streets that bypass all criteria |
| `users` / `sessions` | Auth |

The platform list is defined **once** and used both to seed a new database and
to backfill a row for a platform added later. It used to be two lists, and they
had already drifted to different defaults.

## Adding a platform

1. Write `scrapers/platforms/adapters/yoursite.js` exporting an adapter and a
   separate parser function.
2. Register it in `scrapers/platforms/index.js`.
3. Add `['yoursite', 'Your Site']` to `PLATFORMS` in `services/database.js`. An
   existing database picks it up on next start.

Map the shared criteria onto the site's own search. Do not add a new config
knob unless the site genuinely needs something the others do not.

## Things that will bite you

- **`npm audit fix --force` will suggest downgrades that break the app.** Check
  what it actually proposes.
- **The dashboard is served statically and cached by the browser.** Hard-refresh
  after editing `public/js/*`.
- **`dotenv` does not override real environment variables.** A stray `PORT` in
  your shell wins over `.env`. This is correct behaviour and surprising anyway.
- **Playwright needs its browser downloaded** (`npx playwright install
  chromium`) before auto-apply works. It is not pulled in automatically.
