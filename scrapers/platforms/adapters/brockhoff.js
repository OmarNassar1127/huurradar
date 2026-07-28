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
var brockhoff_exports = {};
__export(brockhoff_exports, {
  brockhoffAdapter: () => brockhoffAdapter,
  parseBrockhoffListings: () => parseBrockhoffListings
});
module.exports = __toCommonJS(brockhoff_exports);
var cheerio = __toESM(require("cheerio"), 1);
var import_http = require("../http");
const BASE = "https://brockhoff.nl";
const RENTAL_CODE = 170;
function parseAddress(raw) {
  if (!raw) return { street: "", city: "" };
  const parts = raw.split(",").map((s) => s.trim());
  return { street: parts[0] ?? "", city: parts[1] ?? "" };
}
function listingIdFrom(url) {
  const match = url.match(/\/(\d{8})\/tehuur\.html/);
  if (match?.[1]) return `brockhoff-${match[1]}`;
  return `brockhoff-${url.split("/").slice(-3, -1).join("-")}`;
}
function parseBrockhoffListings(html, filterFloors) {
  const $ = cheerio.load(html);
  const listings = [];
  $("article.woning").each((_i, element) => {
    const article = $(element);
    const { street, city } = parseAddress(
      article.find(".adresregel").text().trim()
    );
    const listingUrl = article.find(".adreskolom a").first().attr("href") ?? "";
    if (!street || !listingUrl) return;
    let imageUrl = article.find(".hoofdfoto").attr("src") ?? "";
    if (imageUrl && !imageUrl.startsWith("http")) {
      imageUrl = `${BASE}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
    }
    listings.push({
      listingId: listingIdFrom(listingUrl),
      platform: "brockhoff",
      street,
      zipcode: "",
      // not printed on the results page
      city,
      price: (0, import_http.parseEuroPrice)(article.find(".prijs").text().trim()),
      livingArea: filterFloors.minLivingArea,
      totalRooms: filterFloors.minRooms,
      propertyType: "apartment",
      imageUrl,
      listingUrl
    });
  });
  return listings;
}
const brockhoffAdapter = {
  id: "brockhoff",
  label: "Brockhoff",
  site: "brockhoff.nl",
  requires: ["coordinates"],
  async fetch(criteria, ctx) {
    const all = [];
    const seen = /* @__PURE__ */ new Set();
    const minRooms = criteria.minRooms ?? 1;
    const minArea = criteria.minLivingArea ?? 0;
    const radius = criteria.radiusKm ?? 10;
    for (const area of criteria.areas) {
      if (area.lat === void 0 || area.lng === void 0) continue;
      const centre = `${area.city}!${area.lat.toFixed(6)}!${area.lng.toFixed(6)}!${radius.toFixed(4)},5`;
      const url = `${BASE}/Woning/AantalKamers/${minRooms},/KoopHuur/${RENTAL_CODE}/WoningAfstand/${centre}/Woonopp/${minArea}%2C`;
      const response = await ctx.http.get(url, {
        headers: { "Accept-Language": "nl-NL,nl;q=0.9" },
        timeout: 2e4,
        validateStatus: (s) => s >= 200 && s < 500
      });
      if (response.status !== 200 || typeof response.data !== "string") {
        ctx.logger.error(
          `brockhoff: ${area.city} returned status ${response.status}`
        );
        continue;
      }
      for (const listing of parseBrockhoffListings(response.data, {
        minLivingArea: minArea,
        minRooms
      })) {
        if (seen.has(listing.listingId)) continue;
        seen.add(listing.listingId);
        all.push(listing);
      }
      await ctx.delay(1e3);
    }
    ctx.logger.info(`brockhoff: ${all.length} listings`);
    return all;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  brockhoffAdapter,
  parseBrockhoffListings
});
