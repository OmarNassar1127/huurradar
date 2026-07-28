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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var bouwinvest_exports = {};
__export(bouwinvest_exports, {
  bouwinvestAdapter: () => bouwinvestAdapter,
  parseBouwinvestResponse: () => parseBouwinvestResponse
});
module.exports = __toCommonJS(bouwinvest_exports);
const BASE = "https://www.wonenbijbouwinvest.nl";
function parseBouwinvestResponse(data) {
  const items = data?.data;
  if (!Array.isArray(items)) return [];
  const listings = [];
  for (const property of items) {
    if (property.class === "Project") continue;
    listings.push({
      listingId: `bouwinvest-${property.id ?? ""}`,
      platform: "bouwinvest",
      street: property.name ?? "",
      zipcode: property.address?.zipcode ?? "",
      city: property.address?.city ?? "",
      price: property.price?.price ?? 0,
      livingArea: property.sizes?.surface ?? 0,
      totalRooms: property.properties?.total_rooms ?? 0,
      propertyType: property.type ?? "apartment",
      imageUrl: property.images?.main ?? "",
      listingUrl: property.url ?? `${BASE}/huuraanbod/${property.id ?? ""}`
    });
  }
  return listings;
}
const bouwinvestAdapter = {
  id: "bouwinvest",
  label: "Bouwinvest",
  site: "wonenbijbouwinvest.nl",
  requires: [],
  async fetch(criteria, ctx) {
    const all = [];
    const seen = /* @__PURE__ */ new Set();
    const maxPages = criteria.maxPages ?? 7;
    const headers = { Accept: "application/json", Referer: `${BASE}/` };
    for (const area of criteria.areas) {
      const params = new URLSearchParams({
        query: area.city,
        range: String(criteria.radiusKm ?? 10),
        price: `${criteria.minPrice ?? 0}-${criteria.maxPrice}`
      });
      const searchUrl = `${BASE}/api/search?${params.toString()}`;
      const first = await ctx.http.get(searchUrl, {
        headers,
        validateStatus: (s) => s >= 200 && s < 500
      });
      if (first.status !== 200 || !first.data) {
        ctx.logger.error(
          `bouwinvest: ${area.city} returned status ${first.status}`
        );
        continue;
      }
      const collect = (data) => {
        for (const listing of parseBouwinvestResponse(data)) {
          if (seen.has(listing.listingId)) continue;
          seen.add(listing.listingId);
          all.push(listing);
        }
      };
      collect(first.data);
      const lastPage = first.data.meta?.last_page ?? 1;
      for (let page = 2; page <= Math.min(lastPage, maxPages); page++) {
        await ctx.delay(1500);
        const response = await ctx.http.get(`${searchUrl}&page=${page}`, {
          headers,
          validateStatus: (s) => s >= 200 && s < 500
        });
        if (response.status === 200 && response.data) collect(response.data);
      }
      await ctx.delay(1e3);
    }
    ctx.logger.info(`bouwinvest: ${all.length} listings`);
    return all;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  bouwinvestAdapter,
  parseBouwinvestResponse
});
