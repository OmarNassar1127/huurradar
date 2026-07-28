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
var http_exports = {};
__export(http_exports, {
  DEFAULT_USER_AGENT: () => DEFAULT_USER_AGENT,
  consoleLogger: () => consoleLogger,
  cookiesToString: () => cookiesToString,
  createHttpClient: () => createHttpClient,
  delay: () => delay,
  parseCookies: () => parseCookies,
  parseEuroPrice: () => parseEuroPrice,
  silentLogger: () => silentLogger
});
module.exports = __toCommonJS(http_exports);
var import_axios = __toESM(require("axios"), 1);
var import_node_http = __toESM(require("node:http"), 1);
var import_node_https = __toESM(require("node:https"), 1);
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const silentLogger = {
  info: () => {
  },
  error: () => {
  }
};
const consoleLogger = {
  info: (message) => console.log(`[nl-rental-scrapers] ${message}`),
  error: (message, error) => console.error(`[nl-rental-scrapers] ${message}`, error ?? "")
};
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function createHttpClient(options) {
  return import_axios.default.create({
    headers: {
      "User-Agent": options.userAgent ?? DEFAULT_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8"
    },
    timeout: options.timeoutMs ?? 3e4,
    // Some of these hosts resolve to an unreachable AAAA record; force IPv4.
    httpAgent: new import_node_http.default.Agent({ family: 4 }),
    httpsAgent: new import_node_https.default.Agent({ family: 4 })
  });
}
function parseCookies(setCookieHeaders) {
  if (!setCookieHeaders) return {};
  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  const map = {};
  for (const cookie of cookies) {
    const first = cookie.split(";")[0];
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq > 0) map[first.substring(0, eq)] = first.substring(eq + 1);
  }
  return map;
}
function cookiesToString(map) {
  return Object.entries(map).map(([name, value]) => `${name}=${value}`).join("; ");
}
function parseEuroPrice(raw) {
  if (!raw) return 0;
  const match = raw.replace(/\s/g, "").match(/€?([\d.,]+)/);
  if (!match || !match[1]) return 0;
  return parseInt(match[1].replace(/\./g, "").replace(",", ""), 10) || 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_USER_AGENT,
  consoleLogger,
  cookiesToString,
  createHttpClient,
  delay,
  parseCookies,
  parseEuroPrice,
  silentLogger
});
