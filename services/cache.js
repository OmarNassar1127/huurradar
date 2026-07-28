// In-memory cache for live scraper viewer
// Stores results from the last scraper run

let cache = {
  lastRun: null,
  duration: null,
  scrapers: {}
};

function clearCache() {
  cache = {
    lastRun: new Date().toISOString(),
    duration: null,
    scrapers: {}
  };
}

function cacheScraperResults(scraperId, data) {
  cache.scrapers[scraperId] = {
    ...data,
    timestamp: new Date().toISOString()
  };
}

function setRunDuration(duration) {
  cache.duration = duration;
}

function getLiveData() {
  return cache;
}

module.exports = {
  clearCache,
  cacheScraperResults,
  setRunDuration,
  getLiveData
};
