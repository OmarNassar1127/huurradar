"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var funda_exports = {};
__export(funda_exports, {
  fundaAdapter: () => fundaAdapter,
  parseFundaListings: () => parseFundaListings
});
module.exports = __toCommonJS(funda_exports);
var cheerio = __toESM(require("cheerio"), 1);
const BASE = "https://www.funda.nl";
function listingIdFrom(href) {
  const numeric = href.match(/\/(\d{6,})\/?$/);
  if (numeric?.[1]) return numeric[1];
  return href.replace(/^\/|\/$/g, "").replace(/\//g, "-");
}
function parseFundaListings(html) {
  const $ = cheerio.load(html);
  const listings = [];
  $('[data-testid="listingDetailsAddress"]').each((_i, element) => {
    const address = $(element);
    let card = address.parent();
    let href;
    for (let depth = 0; depth < 8 && card.length; depth++) {
      const link = card.find('a[href*="/detail/huur/"]').first().attr("href");
      if (link) {
        href ??= link;
        if (/€\s*[\d.]/.test(card.text())) break;
      }
      card = card.parent();
    }
    if (!href || !card.length) return;
    const lines = address.children().map((_j, child) => $(child).text().trim()).get().filter(Boolean);
    const street = lines[0] ?? address.text().trim();
    const postalCity = lines[1] ?? "";
    const postalMatch = postalCity.match(/(\d{4}\s*[A-Z]{2})\s*(.*)/);
    const zipcode = postalMatch?.[1] ?? "";
    const city = postalMatch?.[2]?.trim() ?? postalCity;
    const priceMatch = card.text().replace(/\s+/g, " ").match(/€\s*([\d.]+)/);
    const price = priceMatch?.[1] ? parseInt(priceMatch[1].replace(/\./g, ""), 10) || 0 : 0;
    let livingArea = 0;
    let bedrooms = 0;
    let seenArea = false;
    card.find("ul li").each((_j, stat) => {
      const text = $(stat).text().trim();
      if (text.includes("m\xB2")) {
        if (!seenArea) {
          livingArea = parseInt(text.replace(/[^0-9]/g, ""), 10) || 0;
          seenArea = true;
        }
      } else if (/^\d+$/.test(text) && bedrooms === 0) {
        bedrooms = parseInt(text, 10);
      }
    });
    const isHouse = /\/detail\/huur\/[^/]+\/huis-/.test(href);
    listings.push({
      listingId: `funda-${listingIdFrom(href)}`,
      platform: "funda",
      street,
      zipcode,
      city,
      price,
      livingArea,
      // Funda counts bedrooms; add the living room for a total-rooms figure.
      totalRooms: bedrooms > 0 ? bedrooms + 1 : 0,
      propertyType: isHouse ? "house" : "apartment",
      imageUrl: card.find("img").first().attr("src") ?? "",
      listingUrl: `${BASE}${href}`
    });
  });
  return listings;
}
const fundaAdapter = {
  id: "funda",
  label: "Funda",
  site: "funda.nl",
  requires: [],
  async fetch(criteria, ctx) {
    const all = [];
    const seen = /* @__PURE__ */ new Set();
    const maxPages = criteria.maxPages ?? 7;
    const radius = criteria.radiusKm ?? 10;
    const minPrice = criteria.minPrice ?? 0;
    const minArea = criteria.minLivingArea ?? 0;
    const minRooms = criteria.minRooms ?? 1;
    for (const area of criteria.areas) {
      const slug = area.city.toLowerCase().replace(/\s+/g, "-");
      const selectedArea = encodeURIComponent(`["${slug},${radius}km"]`);
      const objectType = encodeURIComponent(`["apartment","house"]`);
      const price = encodeURIComponent(`"${minPrice}-${criteria.maxPrice}"`);
      const floorArea = encodeURIComponent(`"${minArea}-"`);
      const rooms = encodeURIComponent(`"${minRooms}-"`);
      for (let page = 1; page <= maxPages; page++) {
        const url = `${BASE}/zoeken/huur?selected_area=${selectedArea}&object_type=${objectType}&price=${price}&floor_area=${floorArea}&rooms=${rooms}&search_result=${page}`;
        let pageListings = [];
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const response = await ctx.http.get(url, {
              validateStatus: (s) => s >= 200 && s < 500,
              timeout: 15e3
            });
            if (response.status === 200 && typeof response.data === "string") {
              pageListings = parseFundaListings(response.data);
            }
            break;
          } catch (error) {
            if (attempt === 2) {
              ctx.logger.error(`funda: page ${page} failed twice`, error);
            } else {
              await ctx.delay(1e3);
            }
          }
        }
        if (pageListings.length === 0) break;
        for (const listing of pageListings) {
          if (seen.has(listing.listingId)) continue;
          seen.add(listing.listingId);
          all.push(listing);
        }
        await ctx.delay(1500);
      }
    }
    ctx.logger.info(`funda: ${all.length} listings`);
    return all;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  fundaAdapter,
  parseFundaListings
});
