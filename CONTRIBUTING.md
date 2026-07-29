# Contributing

## A scraper stopped returning anything

This is the most likely reason you are here, and usually it is not the network.
Sites redesign, selectors go stale, and the scraper keeps returning `0` without
erroring.

**1. Is it actually broken, or is the area just empty?**

Check the Live View in the dashboard. Alliantie and Brockhoff are regional and
legitimately return nothing outside their patch. A platform returning `0` for a
big city is suspicious; `0` for a small one often is not.

**2. Is the page reachable?**

```js
const { createHttpClient } = require('./scrapers/platforms/http');
const http = createHttpClient({});
const r = await http.get(url, { validateStatus: () => true });
console.log(r.status, String(r.data).length);
```

HTTP 200 with a large body and no listings means the **parser** is stale, not
the fetch. That is the common case.

**3. Run the parser against the real page.**

Every parser is exported separately for this:

```js
const { parseFundaListings } = require('./scrapers/platforms/adapters/funda');
console.log(parseFundaListings(html).length);
```

**4. Fix the parser, and anchor on something stable.**

Prefer a `data-testid`, a semantic element, or a URL shape over a Tailwind class
string. Funda's card markup is generated and churns; its address element and
its `/detail/huur/` links do not.

Read stats **by shape, not by position**. A house listing adds a plot-area entry
to the same stats list that an apartment uses for living area alone. Reading
"the first m² value" is correct; reading "index 0" is a coin flip.

## Adding a platform

1. `scrapers/platforms/adapters/yoursite.js`, exporting an adapter object and a
   separate parser function:

```js
const yourAdapter = {
  id: 'yoursite',
  label: 'Your Site',
  site: 'yoursite.nl',
  requires: [],              // 'coordinates' if lat/lng is mandatory
  async fetch(criteria, ctx) { /* → Listing[] */ },
};
```

2. Register it in `scrapers/platforms/index.js`.
3. Add `['yoursite', 'Your Site']` to `PLATFORMS` in `services/database.js`.

Use `ctx.http`, `ctx.logger` and `ctx.delay`. Do not import your own HTTP
client: timeouts, user agent and pacing are meant to stay consistent across
every adapter.

Map the shared criteria onto the site's own search. Only add a new config knob
if the site genuinely needs something no other one does.

## The two normalisations to get right

- **`totalRooms` includes the living room.** Sites that print bedrooms need
  `bedrooms + 1`. Getting this wrong makes your platform quietly stricter or
  looser than the rest.
- **`0` means unknown, not zero.** If the site does not print a figure, leave it
  `0`. The filter treats unknown as a pass on purpose.

## Please do not tune out the pacing

Adapters run sequentially, with delays between pages and areas, and
`MAX_PAGES_PER_PLATFORM` is low by default. That is deliberate. These are other
people's servers, and the fastest way for everyone to lose access is a pull
request that removes the delays.

## Running it

```bash
npm install
cp .env.example .env    # SEARCH_AREAS is the only required field
npm start
```

Set `SCRAPE_INTERVAL_MINUTES` high and `MAX_PAGES_PER_PLATFORM=1` while you are
developing.

## Pull requests

Keep them focused. A parser fix and a feature are two pull requests. If you fix
a parser, say which site changed and what you anchored on instead, so the next
person knows what to look at when it breaks again.
