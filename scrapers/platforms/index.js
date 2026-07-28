"use strict";

const { alliantieAdapter } = require("./adapters/alliantie");
const { bouwinvestAdapter } = require("./adapters/bouwinvest");
const { brockhoffAdapter } = require("./adapters/brockhoff");
const { fundaAdapter } = require("./adapters/funda");
const { mvgmAdapter } = require("./adapters/mvgm");
const { vbtAdapter } = require("./adapters/vbt");
const { dedupeListings, filterListings } = require("./filter");
const { createHttpClient, delay, silentLogger } = require("./http");
const adapters = [
  fundaAdapter,
  vbtAdapter,
  bouwinvestAdapter,
  mvgmAdapter,
  alliantieAdapter,
  brockhoffAdapter
];
function getAdapter(id) {
  return adapters.find((a) => a.id === id);
}
function blockedReason(adapter, criteria) {
  if (adapter.requires.includes("coordinates")) {
    const withCoords = criteria.areas.filter(
      (a) => a.lat !== void 0 && a.lng !== void 0
    );
    if (withCoords.length === 0) {
      return `${adapter.id} needs lat/lng on at least one area`;
    }
  }
  if (criteria.areas.length === 0) return "no search areas supplied";
  return null;
}
async function scrape(criteria, options = {}) {
  const logger = options.logger ?? silentLogger;
  const ctx = {
    http: (0, createHttpClient)({
      timeoutMs: options.timeoutMs,
      userAgent: options.userAgent
    }),
    logger,
    delay: delay
  };
  const selected = options.platforms ? adapters.filter((a) => options.platforms.includes(a.id)) : adapters;
  const results = [];
  for (const adapter of selected) {
    const startedAt = Date.now();
    const blocked = blockedReason(adapter, criteria);
    if (blocked) {
      logger.info(`${adapter.id}: skipped (${blocked})`);
      results.push({
        platform: adapter.id,
        listings: [],
        ok: false,
        skipped: blocked,
        durationMs: 0
      });
      continue;
    }
    try {
      const raw = await adapter.fetch(criteria, ctx);
      const listings = options.filter === false ? (0, dedupeListings)(raw) : (0, filterListings)((0, dedupeListings)(raw), criteria);
      results.push({
        platform: adapter.id,
        listings,
        ok: true,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`${adapter.id}: failed`, error);
      results.push({
        platform: adapter.id,
        listings: [],
        ok: false,
        error: message,
        durationMs: Date.now() - startedAt
      });
    }
  }
  return results;
}
async function scrapePlatform(id, criteria, options = {}) {
  if (!getAdapter(id)) {
    throw new Error(
      `Unknown platform "${id}". Known: ${adapters.map((a) => a.id).join(", ")}`
    );
  }
  const [result] = await scrape(criteria, { ...options, platforms: [id] });
  return result;
}
function collectListings(results) {
  return (0, dedupeListings)(results.flatMap((r) => r.listings)).sort(
    (a, b) => a.price - b.price
  );
}

module.exports = {
  adapters,
  getAdapter,
  blockedReason,
  scrape,
  scrapePlatform,
};
