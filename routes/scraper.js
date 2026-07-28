const express = require('express');
const { fetchAllListings, getScraperState } = require('../scrapers');
const { logError, logInfo } = require('../services/logger');
const { getDb, updateHouseAiAnalysis } = require('../services/database');
const { analyzeListingRequirements } = require('../services/ai');
const { getLiveData } = require('../services/cache');

const router = express.Router();

// Trigger manual scrape
router.post('/', async (req, res) => {
  const state = getScraperState();
  
  if (state.isRunning) {
    return res.status(409).json({ error: 'Scraper is already running' });
  }
  
  res.json({ message: 'Scrape started', startedAt: new Date().toISOString() });
  
  // Run async
  fetchAllListings().catch(err => logError('Manual scrape failed', err));
});

// Get scraper status
router.get('/status', (req, res) => {
  res.json(getScraperState());
});

// Get live scraper data (cached from last run)
router.get('/live', (req, res) => {
  res.json(getLiveData());
});

// Backfill AI analysis for existing houses
router.post('/backfill', async (req, res) => {
  const db = getDb();

  // Get all non-archived houses where ai_approved IS NULL
  const houses = db.prepare(`
    SELECT * FROM houses
    WHERE is_archived = 0 AND ai_approved IS NULL
    ORDER BY created_at DESC
  `).all();

  if (houses.length === 0) {
    return res.json({ message: 'No houses need AI backfill', processed: 0 });
  }

  logInfo(`Starting AI backfill for ${houses.length} houses`);

  // Respond immediately, process in background
  res.json({ message: 'AI backfill started', toProcess: houses.length });

  // Process each house
  let processed = 0;
  let approved = 0;
  let skipped = 0;

  for (const house of houses) {
    try {
      // Convert DB row to listing format for AI analysis
      const listing = {
        listingId: house.listing_id,
        street: house.street,
        zipcode: house.zipcode,
        city: house.city,
        price: house.price,
        livingArea: house.living_area,
        totalRooms: house.total_rooms,
        propertyType: house.property_type,
        listingUrl: house.listing_url,
        platform: house.platform
      };

      const aiResult = await analyzeListingRequirements(listing);
      updateHouseAiAnalysis(house.listing_id, aiResult.shouldNotify, aiResult.analysis);

      processed++;
      if (aiResult.shouldNotify) {
        approved++;
        logInfo(`✅ Backfill: ${house.street} - AI approved`);
      } else {
        skipped++;
        logInfo(`⏭️ Backfill: ${house.street} - AI skipped`);
      }
    } catch (error) {
      logError(`Backfill failed for ${house.street}`, error);
    }
  }

  logInfo(`AI backfill complete: ${processed} processed, ${approved} approved, ${skipped} skipped`);
});

module.exports = router;
