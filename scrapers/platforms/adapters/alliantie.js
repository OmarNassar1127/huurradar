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
var alliantie_exports = {};
__export(alliantie_exports, {
  alliantieAdapter: () => alliantieAdapter,
  parseAlliantieResponse: () => parseAlliantieResponse
});
module.exports = __toCommonJS(alliantie_exports);
var import_http = require("../http");
const BASE = "https://ik-zoek.de-alliantie.nl";
function cityFromUrl(url) {
  if (!url) return "";
  const part = url.split("/")[1];
  if (!part) return "";
  return part.charAt(0).toUpperCase() + part.slice(1);
}
function parseAlliantieResponse(data) {
  const items = data?.data;
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item.isInSelection === true).map((item) => {
    const firstImage = item.images?.[0]?.url;
    const [lat, lng] = (item.coordinates ?? "").split(",").map((c) => parseFloat(c.trim()));
    return {
      listingId: `alliantie-${item.dossierId ?? ""}`,
      platform: "alliantie",
      street: item.address ?? "",
      zipcode: "",
      // not provided by the API
      city: cityFromUrl(item.url),
      price: (0, import_http.parseEuroPrice)(item.price),
      livingArea: item.size ?? 0,
      totalRooms: item.rooms ?? 0,
      propertyType: item.type ?? "apartment",
      imageUrl: firstImage ? `${BASE}${firstImage}` : "",
      listingUrl: `${BASE}/${item.url ?? ""}`,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null
    };
  });
}
async function getVerificationToken(ctx) {
  const response = await ctx.http.get(`${BASE}/huren`, {
    timeout: 15e3,
    validateStatus: (s) => s >= 200 && s < 500
  });
  if (typeof response.data !== "string") return null;
  const match = response.data.match(
    /name="__RequestVerificationToken"[^>]*value="([^"]+)"/
  );
  return match?.[1] ?? null;
}
const alliantieAdapter = {
  id: "alliantie",
  label: "de Alliantie",
  site: "ik-zoek.de-alliantie.nl",
  requires: [],
  async fetch(criteria, ctx) {
    const token = await getVerificationToken(ctx);
    if (!token) {
      ctx.logger.error("alliantie: no verification token, skipping");
      return [];
    }
    await ctx.delay(500);
    const form = new URLSearchParams();
    form.append("__RequestVerificationToken", token);
    form.append("type", "huren");
    for (const area of criteria.areas) form.append("cities[]", area.city);
    form.append("maxpricerent", String(criteria.maxPrice));
    form.append("minrooms", String(criteria.minRooms ?? 1));
    form.append("huursegment", "vrijesector");
    form.append("minsurface", String(criteria.minLivingArea ?? 0));
    form.append("maxsurface", "0");
    form.append("page", "1");
    form.append("sorting", "rel");
    form.append("order", "desc");
    const response = await ctx.http.post(
      `${BASE}/getproperties`,
      form.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
          Origin: BASE,
          Referer: `${BASE}/huren`
        },
        timeout: 2e4,
        validateStatus: (s) => s >= 200 && s < 500
      }
    );
    const listings = parseAlliantieResponse(response.data);
    ctx.logger.info(`alliantie: ${listings.length} listings`);
    return listings;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  alliantieAdapter,
  parseAlliantieResponse
});
