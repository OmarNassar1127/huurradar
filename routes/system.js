const express = require('express');
const path = require('path');
const { getSystemStats, getStorageStats } = require('../services/system');
const { getLogs } = require('../services/logger');
const { getHouseStats, getRecipients } = require('../services/database');
const { getScraperState } = require('../scrapers');

const router = express.Router();

// Dashboard status
router.get('/status', (req, res) => {
  const houseStats = getHouseStats();
  const dataDir = path.join(process.cwd(), 'data');
  const storageStats = getStorageStats(dataDir);
  
  res.json({
    scraper: getScraperState(),
    houses: houseStats,
    recipients: getRecipients().length,
    storage: storageStats
  });
});

// Read once at require time; package.json cannot change while we run.
const appVersion = require('../package.json').version;

// System stats
router.get('/system', (req, res) => {
  const systemStats = getSystemStats();
  const dataDir = path.join(process.cwd(), 'data');
  const storageStats = getStorageStats(dataDir);
  
  res.json({
    ...systemStats,
    version: appVersion,
    storage: storageStats
  });
});

// Logs
router.get('/logs', (req, res) => {
  const { limit = 100 } = req.query;
  res.json(getLogs(parseInt(limit)));
});

module.exports = router;
