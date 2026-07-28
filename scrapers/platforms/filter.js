"use strict";

/**
 * Drop repeats by `listingId`, keeping the first occurrence.
 *
 * Criteria filtering deliberately does NOT live here. `scrapers/base.js` owns
 * it, because it reads the per-platform settings out of the database. Having a
 * second copy of the same rule in this directory is how the two drift apart.
 */
function dedupeListings(listings) {
  const seen = new Set();
  const out = [];
  for (const listing of listings) {
    if (seen.has(listing.listingId)) continue;
    seen.add(listing.listingId);
    out.push(listing);
  }
  return out;
}

module.exports = {
  dedupeListings,
};
