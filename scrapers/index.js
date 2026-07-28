const { logInfo, logError } = require('../services/logger');
const { sendNotification } = require('../services/email');
const {
  getHouseByListingId,
  insertHouse,
  updateHouse,
  markHouseNotified,
  archiveOldHouses,
  getScrapers,
  updateScraperStatus,
  updateHouseAiAnalysis
} = require('../services/database');
const { meetsCriteria, getSpecialStreets, getSearchAreas, getCriteriaForPlatform } = require('./base');
const { analyzeListingRequirements } = require('../services/ai');
const { clearCache, cacheScraperResults, setRunDuration } = require('../services/cache');

function isSpecialAddress(listing) {
  const streetLower = (listing.street || '').toLowerCase();
  const specialStreets = getSpecialStreets();
  return specialStreets.some(special => streetLower.includes(special));
}

// The six platform adapters. One file per site under ./platforms/adapters.
const { scrapePlatform, getAdapter } = require('./platforms');

// Scraper state
let scraperState = {
  isRunning: false,
  lastRun: null,
  lastRunDuration: null,
  nextRun: null,
};

function getScraperState() {
  return scraperState;
}

function setNextRun(date) {
  scraperState.nextRun = date;
}

async function processMatchingListing(listing, aiResult) {
  listing.aiAnalysis = aiResult.analysis;

  // Save AI analysis results to database
  updateHouseAiAnalysis(listing.listingId, aiResult.shouldNotify, aiResult.analysis);

  if (aiResult.shouldNotify) {
    // Send email notification
    await sendNotification(listing);
    logInfo(`✅ Notified: ${listing.street} - AI says qualifies`);
  } else {
    logInfo(`⏭️ Skipped: ${listing.street} - AI says doesn't qualify`);
  }

  // Mark as notified either way (so we don't re-process)
  markHouseNotified(listing.listingId);
  return aiResult.shouldNotify;
}

async function updateDatabase(listings) {
  logInfo(`Updating database with ${listings.length} listings`);

  let newCount = 0, updatedCount = 0, notifiedCount = 0;

  for (const listing of listings) {
    try {
      const existing = getHouseByListingId(listing.listingId);

      if (!existing) {
        insertHouse(listing);
        newCount++;

        if (meetsCriteria(listing)) {
          // Special addresses bypass AI and always notify
          if (isSpecialAddress(listing)) {
            listing.aiAnalysis = 'Special address - auto-approved';
            updateHouseAiAnalysis(listing.listingId, true, listing.aiAnalysis);
            await sendNotification(listing);
            markHouseNotified(listing.listingId);
            logInfo(`✅ Notified (special address): ${listing.street}`);
            notifiedCount++;
          } else {
            const aiResult = await analyzeListingRequirements(listing);
            const wasNotified = await processMatchingListing(listing, aiResult);
            if (wasNotified) notifiedCount++;
          }
        }
      } else {
        updateHouse(listing);
        updatedCount++;

        if (!existing.is_notified && meetsCriteria(listing)) {
          // Special addresses bypass AI and always notify
          if (isSpecialAddress(listing)) {
            listing.aiAnalysis = 'Special address - auto-approved';
            updateHouseAiAnalysis(listing.listingId, true, listing.aiAnalysis);
            await sendNotification(listing);
            markHouseNotified(listing.listingId);
            logInfo(`✅ Notified (special address): ${listing.street}`);
            notifiedCount++;
          } else {
            const aiResult = await analyzeListingRequirements(listing);
            const wasNotified = await processMatchingListing(listing, aiResult);
            if (wasNotified) notifiedCount++;
          }
        }
      }
    } catch (error) {
      logError(`Error processing listing ${listing.listingId}`, error);
    }
  }

  logInfo(`Database update complete: ${newCount} new, ${updatedCount} updated, ${notifiedCount} notified`);
}

async function runScraper(id, areas) {
  try {
    const criteria = getCriteriaForPlatform(id);

    // Skip the adapter-level filter: we re-check locally anyway, and keeping
    // every fetched listing lets the live viewer show what was dropped and why.
    const result = await scrapePlatform(
      id,
      {
        areas,
        maxPrice: criteria.maxPrice,
        minRooms: criteria.minRooms,
        minLivingArea: criteria.minLivingArea,
        radiusKm: parseInt(process.env.SEARCH_RADIUS_KM) || 10,
        maxPages: parseInt(process.env.MAX_PAGES_PER_PLATFORM) || 5
      },
      {
        filter: false,
        logger: { info: logInfo, error: logError },
        userAgent: process.env.SCRAPER_USER_AGENT
      }
    );

    if (result.skipped) {
      logInfo(`Scraper ${id} skipped: ${result.skipped}`);
      updateScraperStatus(id, 'error', 0, result.skipped);
      return [];
    }
    if (!result.ok) {
      logError(`Scraper ${id} failed`, result.error);
      updateScraperStatus(id, 'error', 0, result.error || 'Unknown error');
      return [];
    }

    updateScraperStatus(id, 'ok', result.listings.length, null);
    return result.listings;
  } catch (error) {
    const errorMsg = error.message || 'Unknown error';
    logError(`Scraper ${id} failed`, error);
    updateScraperStatus(id, 'error', 0, errorMsg);
    return [];
  }
}

async function fetchAllListings() {
  if (scraperState.isRunning) {
    logInfo("Scraper already running, skipping");
    return;
  }

  scraperState.isRunning = true;
  const startTime = Date.now();
  logInfo("🚀 Starting multi-platform scrape");

  // Clear cache at the start of each run
  clearCache();

  try {
    let allListings = [];

    // Get enabled scrapers from DB
    const scrapers = getScrapers().filter(s => s.enabled);

    const areas = getSearchAreas();
    if (areas.length === 0) {
      logError(
        'SEARCH_AREAS is not set, so there is nowhere to search. ' +
        'Set it in .env, e.g. SEARCH_AREAS=Utrecht:52.0907:5.1214'
      );
      return;
    }

    // Cities you will actually consider, comma-separated in ALLOWED_CITIES.
    // Matched case-insensitively as a substring, so "amsterdam" also keeps
    // "Amsterdam-Duivendrecht". Leave the variable unset to accept every city
    // the platforms return and filter on price and criteria alone.
    const ALLOWED_CITIES = (process.env.ALLOWED_CITIES || '')
      .split(',')
      .map(c => c.trim().toLowerCase())
      .filter(Boolean);

    for (const scraper of scrapers) {
      if (getAdapter(scraper.id)) {
        const listings = await runScraper(scraper.id, areas);

        // Tag each listing with filter results for live viewer
        const taggedListings = listings.map(l => {
          const city = (l.city || '').toLowerCase();
          const inAllowedCity =
            ALLOWED_CITIES.length === 0 || ALLOWED_CITIES.some(c => city.includes(c));
          const inBudget = l.price > 0 && l.price <= scraper.max_price;
          const passedCriteria = meetsCriteria(l);
          const existing = getHouseByListingId(l.listingId);

          let filterReason = null;
          if (!inAllowedCity) filterReason = 'city';
          else if (!inBudget) filterReason = 'price';
          else if (!passedCriteria) filterReason = 'criteria';

          return {
            ...l,
            _passed: inAllowedCity && inBudget,
            _isNew: !existing,
            _filterReason: filterReason
          };
        });

        // Calculate stats for this scraper
        const stats = {
          fetched: taggedListings.length,
          passed: taggedListings.filter(l => l._passed).length,
          new: taggedListings.filter(l => l._isNew && l._passed).length,
          existing: taggedListings.filter(l => !l._isNew && l._passed).length,
          filteredByCity: taggedListings.filter(l => l._filterReason === 'city').length,
          filteredByPrice: taggedListings.filter(l => l._filterReason === 'price').length,
          filteredByCriteria: taggedListings.filter(l => l._filterReason === 'criteria').length
        };

        // Cache the results for live viewer
        cacheScraperResults(scraper.id, {
          name: scraper.name,
          listings: taggedListings,
          stats
        });

        allListings.push(...taggedListings);
      }
    }

    // Filter to only listings that passed
    const filteredListings = allListings.filter(l => l._passed);
    logInfo(`🏠 Total: ${allListings.length} listings, ${filteredListings.length} within budget & allowed cities`);

    if (filteredListings.length > 0) {
      await updateDatabase(filteredListings);
    }

    // Auto-archive old listings (older than 7 days)
    const archivedCount = archiveOldHouses(7);
    if (archivedCount > 0) {
      logInfo(`📦 Archived ${archivedCount} old listings`);
    }

    scraperState.lastRun = new Date().toISOString();
    scraperState.lastRunDuration = Date.now() - startTime;
    setRunDuration(scraperState.lastRunDuration);
    logInfo(`✅ Scrape complete in ${scraperState.lastRunDuration}ms`);
  } catch (error) {
    logError("Scrape failed", error);
  } finally {
    scraperState.isRunning = false;
  }
}

module.exports = {
  fetchAllListings,
  getScraperState,
  setNextRun
};
