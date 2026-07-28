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
var vbt_exports = {};
__export(vbt_exports, {
  parseVbtResponse: () => parseVbtResponse,
  vbtAdapter: () => vbtAdapter
});
module.exports = __toCommonJS(vbt_exports);
const BASE = "https://vbtverhuurmakelaars.nl";
function parseVbtResponse(data) {
  const houses = data?.houses;
  if (!Array.isArray(houses)) return [];
  const listings = [];
  for (const house of houses) {
    listings.push({
      listingId: `vbt-${house.id ?? ""}`,
      platform: "vbt",
      street: house.address?.house ?? "",
      zipcode: "",
      city: house.address?.city ?? "",
      price: house.prices?.rental?.price ?? 0,
      // VBT exposes `plot`, which for its apartments is the living area.
      livingArea: house.plot ?? 0,
      totalRooms: house.rooms ?? 0,
      propertyType: house.attributes?.type?.category ?? "apartment",
      imageUrl: house.image ? `${BASE}${house.image}` : "",
      listingUrl: `${BASE}${house.url ?? ""}`
    });
  }
  return listings;
}
const vbtAdapter = {
  id: "vbt",
  label: "VBT Verhuurmakelaars",
  site: "vbtverhuurmakelaars.nl",
  requires: [],
  async fetch(criteria, ctx) {
    const all = [];
    const seen = /* @__PURE__ */ new Set();
    for (const area of criteria.areas) {
      const filter = {
        city: area.city,
        radius: criteria.radiusKm ?? 10,
        priceRental: { min: criteria.minPrice ?? 0, max: criteria.maxPrice },
        surface: criteria.minLivingArea ?? 0
      };
      const cookies = `language=nl;filter_properties=${encodeURIComponent(
        JSON.stringify(filter)
      )}`;
      const response = await ctx.http.get(`${BASE}/api/properties/12/1`, {
        params: { search: true },
        headers: { Cookie: cookies, Referer: `${BASE}/woningen` },
        validateStatus: (s) => s >= 200 && s < 500
      });
      if (response.status !== 200 || !response.data) {
        ctx.logger.error(`vbt: ${area.city} returned status ${response.status}`);
        continue;
      }
      for (const listing of parseVbtResponse(response.data)) {
        if (seen.has(listing.listingId)) continue;
        seen.add(listing.listingId);
        all.push(listing);
      }
      await ctx.delay(1e3);
    }
    ctx.logger.info(`vbt: ${all.length} listings`);
    return all;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  parseVbtResponse,
  vbtAdapter
});
