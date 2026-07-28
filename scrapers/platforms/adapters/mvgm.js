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
var mvgm_exports = {};
__export(mvgm_exports, {
  mvgmAdapter: () => mvgmAdapter,
  parseMvgmListings: () => parseMvgmListings
});
module.exports = __toCommonJS(mvgm_exports);
var cheerio = __toESM(require("cheerio"), 1);
var import_http = require("../http");
const BASE = "https://ikwilhuren.nu";
const AANBOD = `${BASE}/aanbod/`;
function parseMvgmListings(html) {
  const $ = cheerio.load(html);
  const listings = [];
  $("a.stretched-link").each((_i, element) => {
    const link = $(element);
    const href = link.attr("href");
    if (!href || !href.startsWith("/object/")) return;
    const idPart = href.split("/").filter(Boolean).pop();
    if (!idPart) return;
    const cardBody = link.closest(".card-body");
    const card = cardBody.parent();
    const img = card.find("img").first();
    const street = link.text().trim() || (img.attr("alt") ?? "").trim();
    const slug = href.split("/").filter(Boolean)[1] ?? "";
    const slugMatch = slug.match(/^([a-z-]+)-(\d{4}[a-z]{2})-/i);
    const city = slugMatch?.[1] ? slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
    const zipcode = slugMatch?.[2] ? slugMatch[2].toUpperCase() : "";
    const cardText = cardBody.text();
    const priceMatch = cardText.match(/€\s*([\d.,]+),-?\s*\/mnd/);
    const price = priceMatch?.[1] ? parseInt(priceMatch[1].replace(/\./g, "").replace(",", ""), 10) : 0;
    const sizeMatch = cardText.match(/(\d+)\s*m/);
    const livingArea = sizeMatch?.[1] ? parseInt(sizeMatch[1], 10) : 0;
    const bedroomMatch = cardText.match(/(\d+)\s*slaapkamer/);
    const bedrooms = bedroomMatch?.[1] ? parseInt(bedroomMatch[1], 10) : 0;
    let imgSrc = img.attr("src") ?? "";
    if (!imgSrc) {
      const srcsetMatch = (img.attr("srcset") ?? "").match(/(\S+)\s+\d+w/);
      imgSrc = srcsetMatch?.[1] ?? "";
    }
    let imageUrl = "";
    if (imgSrc) {
      const mediaMatch = imgSrc.match(
        /(\/media\/[a-f0-9]{2}\/[a-f0-9]+\/)[^/]+(\/thumb\.jpg)/
      );
      if (mediaMatch?.[1] && mediaMatch[2]) {
        imageUrl = `${BASE}${mediaMatch[1]}576x383${mediaMatch[2]}`;
      } else if (imgSrc.startsWith("//")) {
        imageUrl = `https:${imgSrc}`;
      } else if (imgSrc.startsWith("/")) {
        imageUrl = `${BASE}${imgSrc}`;
      } else {
        imageUrl = imgSrc;
      }
    }
    listings.push({
      listingId: `mvgm-${idPart}`,
      platform: "mvgm",
      street,
      zipcode,
      city,
      price,
      livingArea,
      // The card prints bedrooms; add the living room for a total.
      totalRooms: bedrooms > 0 ? bedrooms + 1 : 0,
      propertyType: "apartment",
      imageUrl,
      listingUrl: `${BASE}${href}`
    });
  });
  return listings;
}
async function fetchArea(area, criteria, ctx, seen) {
  const listings = [];
  let cookies = {};
  const first = await ctx.http.get(AANBOD, {
    timeout: 15e3,
    validateStatus: () => true
  });
  cookies = { ...cookies, ...(0, import_http.parseCookies)(first.headers["set-cookie"]) };
  await ctx.delay(500);
  const second = await ctx.http.get(AANBOD, {
    headers: { Cookie: (0, import_http.cookiesToString)(cookies), Referer: AANBOD },
    timeout: 15e3,
    validateStatus: () => true
  });
  cookies = { ...cookies, ...(0, import_http.parseCookies)(second.headers["set-cookie"]) };
  if (typeof second.data !== "string") return listings;
  const $page = cheerio.load(second.data);
  const csrfToken = $page('meta[name="csrf"]').attr("content") ?? $page('input[name="_token"]').first().attr("value");
  if (!csrfToken) {
    ctx.logger.error(`mvgm: no CSRF token for ${area.city}`);
    return listings;
  }
  await ctx.delay(500);
  const objSearch = JSON.stringify({
    weergavenaam: area.displayName ?? `Gemeente ${area.city}`,
    lat: area.lat,
    lng: area.lng
  });
  const form = new URLSearchParams([
    ["postrequest", "doeFilter"],
    ["objSearch", objSearch],
    ["selAfstand", String(criteria.radiusKm ?? 10)],
    ["_token", csrfToken],
    ["selPrijsVan", criteria.minPrice ? String(criteria.minPrice) : ""],
    ["selPrijsTot", String(criteria.maxPrice)],
    ["selWoonoppervlakteVan", String(criteria.minLivingArea ?? 0)],
    ["selWoonoppervlakteTot", ""],
    ["selWoninghoofdtypeId", ""],
    // The form asks for bedrooms; our criteria count total rooms.
    ["selSlaapkamersVan", String(Math.max(1, (criteria.minRooms ?? 2) - 1))],
    ["selZorg", ""],
    ["selBeschikbaarheid", ""],
    ["selEnergielabel", ""]
  ]);
  const postHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: (0, import_http.cookiesToString)(cookies),
    Referer: AANBOD,
    Origin: BASE
  };
  const xsrf = cookies["XSRF-TOKEN"];
  if (xsrf) postHeaders["X-XSRF-TOKEN"] = decodeURIComponent(xsrf);
  const posted = await ctx.http.post(AANBOD, form.toString(), {
    headers: postHeaders,
    timeout: 15e3,
    maxRedirects: 0,
    validateStatus: () => true
  });
  cookies = { ...cookies, ...(0, import_http.parseCookies)(posted.headers["set-cookie"]) };
  await ctx.delay(500);
  const maxPages = criteria.maxPages ?? 7;
  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = page === 1 ? AANBOD : `${AANBOD}?page=${page}`;
    const response = await ctx.http.get(pageUrl, {
      headers: { Cookie: (0, import_http.cookiesToString)(cookies), Referer: AANBOD },
      timeout: 15e3,
      validateStatus: () => true
    });
    if (typeof response.data !== "string") break;
    const pageListings = parseMvgmListings(response.data);
    if (pageListings.length === 0) break;
    let fresh = 0;
    for (const listing of pageListings) {
      if (seen.has(listing.listingId)) continue;
      seen.add(listing.listingId);
      listings.push(listing);
      fresh++;
    }
    if (fresh === 0) break;
    const $ = cheerio.load(response.data);
    if ($(`a[href*="page=${page + 1}"]`).length === 0) break;
    await ctx.delay(500);
  }
  return listings;
}
const mvgmAdapter = {
  id: "mvgm",
  label: "MVGM (ikwilhuren.nu)",
  site: "ikwilhuren.nu",
  requires: ["coordinates"],
  async fetch(criteria, ctx) {
    const all = [];
    const seen = /* @__PURE__ */ new Set();
    for (const area of criteria.areas) {
      if (area.lat === void 0 || area.lng === void 0) continue;
      try {
        all.push(...await fetchArea(area, criteria, ctx, seen));
      } catch (error) {
        ctx.logger.error(`mvgm: ${area.city} failed`, error);
      }
      await ctx.delay(1e3);
    }
    ctx.logger.info(`mvgm: ${all.length} listings`);
    return all;
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  mvgmAdapter,
  parseMvgmListings
});
