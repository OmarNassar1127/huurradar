const { getScraperConfig, getSpecialAddresses } = require('../services/database');

// Fallback used only before the database has been seeded.
const DEFAULT_CRITERIA = {
  minRooms: parseInt(process.env.DEFAULT_MIN_ROOMS) || 2,
  minLivingArea: parseInt(process.env.DEFAULT_MIN_LIVING_AREA) || 40,
  maxPrice: parseInt(process.env.DEFAULT_MAX_PRICE) || 2000
};

/**
 * Streets you always want to hear about, whatever the criteria say. Managed
 * from the Settings page in the dashboard; empty by default.
 */
function getSpecialStreets() {
  try {
    return getSpecialAddresses().map(a => a.address.toLowerCase());
  } catch (e) {
    // DB not initialized yet
    return [];
  }
}

function getCriteriaForPlatform(platform) {
  try {
    const config = getScraperConfig(platform);
    if (config) {
      return {
        minRooms: config.min_rooms,
        minLivingArea: config.min_living_area,
        maxPrice: config.max_price
      };
    }
  } catch (e) {
    // DB not initialized yet, use defaults
  }
  return DEFAULT_CRITERIA;
}

/**
 * Where to search. Set SEARCH_AREAS as a semicolon-separated list of
 * `City:lat:lng` entries, for example:
 *
 *   SEARCH_AREAS=Utrecht:52.0907:5.1214;Amersfoort:52.1561:5.3878
 *
 * Coordinates are optional per entry, but MVGM and Brockhoff encode the search
 * centre as a coordinate and are skipped for any area without one. Get them by
 * right-clicking a spot in Google Maps.
 */
function getSearchAreas() {
  const raw = (process.env.SEARCH_AREAS || '').trim();
  if (!raw) return [];

  return raw.split(';').map(entry => {
    const [city, lat, lng] = entry.split(':').map(s => (s || '').trim());
    if (!city) return null;
    const area = { city };
    if (lat && lng && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
      area.lat = Number(lat);
      area.lng = Number(lng);
    }
    return area;
  }).filter(Boolean);
}

/**
 * Does a listing match the criteria for its platform?
 *
 * A `0` for rooms or living area means the platform did not print the figure,
 * not that the place has none. Those pass: several platforms pre-filter
 * server-side and never show the number, so rejecting on a missing value
 * throws away good results.
 */
function meetsCriteria(listing) {
  // Special addresses always notify, regardless of criteria
  const streetLower = (listing.street || '').toLowerCase();
  const specialStreets = getSpecialStreets();
  if (specialStreets.some(special => streetLower.includes(special))) {
    return true;
  }

  const criteria = getCriteriaForPlatform(listing.platform);

  const roomsOk = listing.totalRooms === 0 || listing.totalRooms >= criteria.minRooms;
  const areaOk = listing.livingArea === 0 || listing.livingArea >= criteria.minLivingArea;
  const priceOk = listing.price > 0 && listing.price <= criteria.maxPrice;

  return roomsOk && areaOk && priceOk;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  meetsCriteria,
  getCriteriaForPlatform,
  getSpecialStreets,
  getSearchAreas,
  delay,
  DEFAULT_CRITERIA
};
