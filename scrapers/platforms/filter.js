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
var filter_exports = {};
__export(filter_exports, {
  dedupeListings: () => dedupeListings,
  filterListings: () => filterListings,
  meetsCriteria: () => meetsCriteria
});
module.exports = __toCommonJS(filter_exports);
function meetsCriteria(listing, criteria, options = {}) {
  const street = listing.street.toLowerCase();
  for (const fragment of options.alwaysInclude ?? []) {
    if (fragment && street.includes(fragment.toLowerCase())) return true;
  }
  const minRooms = criteria.minRooms ?? 1;
  const minLivingArea = criteria.minLivingArea ?? 0;
  const minPrice = criteria.minPrice ?? 0;
  const roomsOk = listing.totalRooms === 0 || listing.totalRooms >= minRooms;
  const areaOk = listing.livingArea === 0 || listing.livingArea >= minLivingArea;
  const priceOk = listing.price > 0 && listing.price >= minPrice && listing.price <= criteria.maxPrice;
  return roomsOk && areaOk && priceOk;
}
function filterListings(listings, criteria, options = {}) {
  return listings.filter(
    (listing) => meetsCriteria(listing, criteria, options)
  );
}
function dedupeListings(listings) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const listing of listings) {
    if (seen.has(listing.listingId)) continue;
    seen.add(listing.listingId);
    out.push(listing);
  }
  return out;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  dedupeListings,
  filterListings,
  meetsCriteria
});
