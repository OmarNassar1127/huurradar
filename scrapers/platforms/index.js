"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var index_exports = {};
__export(index_exports, {
  DEFAULT_USER_AGENT: () => import_http2.DEFAULT_USER_AGENT,
  adapters: () => adapters,
  alliantieAdapter: () => import_alliantie.alliantieAdapter,
  blockedReason: () => blockedReason,
  bouwinvestAdapter: () => import_bouwinvest.bouwinvestAdapter,
  brockhoffAdapter: () => import_brockhoff.brockhoffAdapter,
  collectListings: () => collectListings,
  consoleLogger: () => import_http2.consoleLogger,
  fundaAdapter: () => import_funda.fundaAdapter,
  getAdapter: () => getAdapter,
  mvgmAdapter: () => import_mvgm.mvgmAdapter,
  parseEuroPrice: () => import_http2.parseEuroPrice,
  scrape: () => scrape,
  scrapePlatform: () => scrapePlatform,
  silentLogger: () => import_http2.silentLogger,
  vbtAdapter: () => import_vbt.vbtAdapter
});
module.exports = __toCommonJS(index_exports);
var import_alliantie = require("./adapters/alliantie");
var import_bouwinvest = require("./adapters/bouwinvest");
var import_brockhoff = require("./adapters/brockhoff");
var import_funda = require("./adapters/funda");
var import_mvgm = require("./adapters/mvgm");
var import_vbt = require("./adapters/vbt");
var import_filter = require("./filter");
var import_http = require("./http");
__reExport(index_exports, require("./types"), module.exports);
__reExport(index_exports, require("./filter"), module.exports);
var import_http2 = require("./http");
const adapters = [
  import_funda.fundaAdapter,
  import_vbt.vbtAdapter,
  import_bouwinvest.bouwinvestAdapter,
  import_mvgm.mvgmAdapter,
  import_alliantie.alliantieAdapter,
  import_brockhoff.brockhoffAdapter
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
  const logger = options.logger ?? import_http.silentLogger;
  const ctx = {
    http: (0, import_http.createHttpClient)({
      timeoutMs: options.timeoutMs,
      userAgent: options.userAgent
    }),
    logger,
    delay: import_http.delay
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
      const listings = options.filter === false ? (0, import_filter.dedupeListings)(raw) : (0, import_filter.filterListings)((0, import_filter.dedupeListings)(raw), criteria);
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
  return (0, import_filter.dedupeListings)(results.flatMap((r) => r.listings)).sort(
    (a, b) => a.price - b.price
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_USER_AGENT,
  adapters,
  alliantieAdapter,
  blockedReason,
  bouwinvestAdapter,
  brockhoffAdapter,
  collectListings,
  consoleLogger,
  fundaAdapter,
  getAdapter,
  mvgmAdapter,
  parseEuroPrice,
  scrape,
  scrapePlatform,
  silentLogger,
  vbtAdapter,
  ...require("./types"),
  ...require("./filter")
});
