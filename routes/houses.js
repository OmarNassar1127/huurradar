const express = require('express');
const {
  getHouses,
  getHouseById,
  getHouseStats,
  getDb,
  getApplications,
  getApplicationStats,
  getPendingActionHouses,
  markHouseIgnored,
  markHouseAppliedManual
} = require('../services/database');
const { applyToListing, isAutoApplyEnabled } = require('../services/autoapply');
const { generateMotivationLetter, fetchPageText } = require('../services/ai');
const { logInfo, logError } = require('../services/logger');

const router = express.Router();

// Get all houses
router.get('/', (req, res) => {
  const { notified, platform, archived, city, aiStatus, limit = 15, offset = 0 } = req.query;

  let houses = getHouses({
    notified,
    platform,
    archived: archived === 'true',
    limit: 500, // Fetch more, filter in memory
    offset: 0
  });

  // Apply city filter
  if (city) {
    houses = houses.filter(h => (h.city || '').toLowerCase() === city.toLowerCase());
  }

  // Apply AI status filter
  if (aiStatus === 'approved') {
    houses = houses.filter(h => h.ai_approved === 1);
  } else if (aiStatus === 'skipped') {
    houses = houses.filter(h => h.ai_approved === 0);
  } else if (aiStatus === 'pending') {
    houses = houses.filter(h => h.ai_approved === null);
  }

  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) as count FROM houses WHERE is_archived = ?")
    .get(archived === 'true' ? 1 : 0).count;

  // Sort: approved first, then Amsterdam, then by date
  houses.sort((a, b) => {
    // AI approved first (1 > 0 > null)
    const aApproved = a.ai_approved === 1 ? 2 : a.ai_approved === 0 ? 1 : 0;
    const bApproved = b.ai_approved === 1 ? 2 : b.ai_approved === 0 ? 1 : 0;
    if (aApproved !== bApproved) return bApproved - aApproved;
    // Then Amsterdam
    const aAmsterdam = (a.city || '').toLowerCase().includes('amsterdam') ? 1 : 0;
    const bAmsterdam = (b.city || '').toLowerCase().includes('amsterdam') ? 1 : 0;
    if (aAmsterdam !== bAmsterdam) return bAmsterdam - aAmsterdam;
    // Then by date (newest first)
    return new Date(b.created_at) - new Date(a.created_at);
  });

  // Apply pagination after filtering
  const paginatedHouses = houses.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

  res.json({ houses: paginatedHouses, total: houses.length, limit: parseInt(limit), offset: parseInt(offset) });
});

// Get house stats
router.get('/stats', (req, res) => {
  res.json(getHouseStats());
});

// Get unique cities
router.get('/cities', (req, res) => {
  const db = getDb();
  const cities = db.prepare(`
    SELECT DISTINCT city FROM houses
    WHERE city IS NOT NULL AND city != '' AND is_archived = 0
    ORDER BY city ASC
  `).all().map(r => r.city);
  res.json(cities);
});

// Application endpoints (must be before /:id)
router.get('/applications/list', (req, res) => {
  const { limit = 50 } = req.query;
  const applications = getApplications(parseInt(limit));
  res.json(applications);
});

router.get('/applications/stats', (req, res) => {
  res.json(getApplicationStats());
});

// Get Brockhoff listings pending user action (must be before /:id)
router.get('/pending-actions', (req, res) => {
  const houses = getPendingActionHouses();
  res.json(houses);
});

// Get single house (keep this LAST among GET routes - it's a catch-all)
router.get('/:id', (req, res) => {
  const house = getHouseById(req.params.id);
  if (!house) return res.status(404).json({ error: 'House not found' });
  res.json(house);
});

// Preview motivation letter (generate without submitting)
router.post('/:id/preview', async (req, res) => {
  const house = getHouseById(req.params.id);
  if (!house) {
    return res.status(404).json({ error: 'House not found - it may have been deleted' });
  }

  if (house.platform !== 'brockhoff') {
    return res.status(400).json({ error: 'Letter preview only supported for Brockhoff listings' });
  }

  if (!house.street || !house.listing_url) {
    return res.status(400).json({ error: 'Listing missing required data (street or URL)' });
  }

  try {
    logInfo(`Generating preview letter for: ${house.street}, ${house.city}`);

    const listing = {
      street: house.street,
      city: house.city || 'Unknown',
      price: house.price || 0,
      listingUrl: house.listing_url
    };

    const pageText = await fetchPageText(house.listing_url);
    const letter = await generateMotivationLetter(listing, pageText);

    logInfo(`Preview letter generated for ${house.street} (${letter.length} chars)`);
    res.json({ success: true, letter, house });
  } catch (error) {
    const errorMsg = error.message || 'Unknown error';
    logError(`Preview failed for ${house.street}`, errorMsg);
    res.status(500).json({ error: errorMsg });
  }
});

// Apply to a listing manually (with optional custom letter)
router.post('/:id/apply', async (req, res) => {
  const house = getHouseById(req.params.id);
  if (!house) {
    return res.status(404).json({ error: 'House not found' });
  }

  if (house.platform !== 'brockhoff') {
    return res.status(400).json({ error: 'Auto-apply only supported for Brockhoff listings' });
  }

  if (!isAutoApplyEnabled()) {
    return res.status(400).json({ error: 'Auto-apply not configured. Check CAPTCHA_API_KEY and APPLICANT_EMAIL.' });
  }

  // Get custom letter from request body if provided
  const customLetter = req.body?.letter;

  try {
    logInfo(`Manual apply triggered for: ${house.street}, ${house.city}`);

    // Convert DB row to listing format
    const listing = {
      listingId: house.listing_id,
      street: house.street,
      city: house.city,
      price: house.price,
      listingUrl: house.listing_url,
      platform: house.platform
    };

    const result = await applyToListing(listing, customLetter);
    markHouseAppliedManual(house.id, 'success', result.letter);

    logInfo(`Successfully applied to ${house.street}`);
    res.json({ success: true, letter: result.letter });
  } catch (error) {
    const errorMsg = error.message || 'Unknown error';
    logError(`Apply failed for ${house.street}`, errorMsg);
    markHouseAppliedManual(house.id, 'failed', null);
    res.status(500).json({ error: errorMsg });
  }
});

// Ignore a listing (won't show in pending actions)
router.post('/:id/ignore', (req, res) => {
  const house = getHouseById(req.params.id);
  if (!house) {
    return res.status(404).json({ error: 'House not found' });
  }

  markHouseIgnored(house.id);
  logInfo(`Ignored listing: ${house.street}, ${house.city}`);
  res.json({ success: true });
});

module.exports = router;
