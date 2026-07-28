"use strict";

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
    const seen = new Set();
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

module.exports = {
  parseVbtResponse,
  vbtAdapter,
};
