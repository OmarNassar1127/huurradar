const express = require('express');
const { getScrapers, getScraperConfig, updateScraperConfig, getSpecialAddresses, addSpecialAddress, removeSpecialAddress } = require('../services/database');
const { logInfo } = require('../services/logger');

const router = express.Router();

// Get all scrapers
router.get('/', (req, res) => {
  const scrapers = getScrapers();
  res.json(scrapers);
});

// Get single scraper config
router.get('/:id', (req, res) => {
  const scraper = getScraperConfig(req.params.id);
  if (!scraper) {
    return res.status(404).json({ error: 'Scraper not found' });
  }
  res.json(scraper);
});

// Update scraper config
router.patch('/:id', (req, res) => {
  const { enabled, minRooms, minLivingArea, maxPrice } = req.body;
  const scraper = getScraperConfig(req.params.id);
  
  if (!scraper) {
    return res.status(404).json({ error: 'Scraper not found' });
  }
  
  updateScraperConfig(req.params.id, {
    enabled: enabled !== undefined ? enabled : scraper.enabled,
    minRooms: minRooms !== undefined ? parseInt(minRooms) : scraper.min_rooms,
    minLivingArea: minLivingArea !== undefined ? parseInt(minLivingArea) : scraper.min_living_area,
    maxPrice: maxPrice !== undefined ? parseInt(maxPrice) : scraper.max_price
  });
  
  logInfo(`Updated scraper ${req.params.id} config`);
  res.json({ success: true, scraper: getScraperConfig(req.params.id) });
});

// Get special addresses
router.get('/special-addresses/list', (req, res) => {
  res.json(getSpecialAddresses());
});

// Add special address
router.post('/special-addresses', (req, res) => {
  const { address } = req.body;
  if (!address || !address.trim()) {
    return res.status(400).json({ error: 'Address is required' });
  }
  
  try {
    addSpecialAddress(address);
    logInfo(`Added special address: ${address}`);
    res.json({ success: true, addresses: getSpecialAddresses() });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Address already exists' });
    }
    throw e;
  }
});

// Remove special address
router.delete('/special-addresses/:id', (req, res) => {
  const address = removeSpecialAddress(req.params.id);
  if (!address) {
    return res.status(404).json({ error: 'Address not found' });
  }
  
  logInfo(`Removed special address: ${address.address}`);
  res.json({ success: true, addresses: getSpecialAddresses() });
});

module.exports = router;
