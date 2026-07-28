// Config is read from the directory you run this from, so `npx huurradar` in
// a folder with a .env behaves the same as a git clone.
require("dotenv").config({
  path: process.env.DOTENV_PATH || require('path').join(process.cwd(), '.env')
});
const express = require('express');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

// Services
const { logInfo, logError } = require('./services/logger');
const { initializeDatabase } = require('./services/database');
const { createAuthMiddleware } = require('./services/auth');
const { initAI } = require('./services/ai');
const { initCaptchaSolver } = require('./services/captcha');

// Scrapers
const { fetchAllListings, setNextRun } = require('./scrapers');

// Routes
const authRoutes = require('./routes/auth');
const housesRoutes = require('./routes/houses');
const recipientsRoutes = require('./routes/recipients');
const systemRoutes = require('./routes/system');
const scraperRoutes = require('./routes/scraper');
const scrapersConfigRoutes = require('./routes/scrapers');

// Initialize express
const app = express();

app.use(express.json());

// Ensure directories exist
// Data lives next to wherever you run the app, not inside node_modules, so a
// global install and a git clone both behave predictably.
const dataDir = process.env.HUURRADAR_DATA_DIR || path.join(process.cwd(), 'data');
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

// Initialize database
const db = initializeDatabase(dataDir);

// Initialize AI
initAI();

// Initialize CAPTCHA solver (for auto-apply)
initCaptchaSolver();

// Create auth middleware
const authMiddleware = createAuthMiddleware(db);

// Serve static files
app.use(express.static(publicDir));

// Health check (no auth)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    message: 'HuurRadar is running'
  });
});

// Auth routes (login/logout don't need auth)
app.use('/api/auth', (req, res, next) => {
  // Only require auth for /me and /change-password
  if (req.path === '/me' || req.path === '/change-password') {
    return authMiddleware(req, res, next);
  }
  next();
}, authRoutes);

// Protected API routes
app.use('/api/houses', authMiddleware, housesRoutes);
app.use('/api/recipients', authMiddleware, recipientsRoutes);
app.use('/api/scrape', authMiddleware, scraperRoutes);
app.use('/api/scrapers', authMiddleware, scrapersConfigRoutes);
app.use('/api', authMiddleware, systemRoutes);

// Legacy route support
app.post('/api/test-email', authMiddleware, async (req, res) => {
  const { sendTestEmail } = require('./services/email');
  try {
    const recipients = await sendTestEmail();
    res.json({ success: true, message: 'Test email sent', recipients });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Start the scrape schedule.
//
// SCRAPE_INTERVAL_MINUTES controls how often every enabled platform is polled.
// Keep it sane: these are other people's servers, and six scrapers hammering
// them every minute is how you get blocked. 15 minutes is the default and is
// already fast enough to beat most people to a new listing.
function start() {
  const intervalMinutes = Math.max(
    5,
    parseInt(process.env.SCRAPE_INTERVAL_MINUTES) || 15,
  );
  const intervalMs = intervalMinutes * 60 * 1000;

  logInfo(`Scrape schedule: every ${intervalMinutes} minutes`);
  cron.schedule(`*/${intervalMinutes} * * * *`, () => {
    setNextRun(new Date(Date.now() + intervalMs).toISOString());
    fetchAllListings().catch(err => logError("Scheduled scrape failed", err));
  });
  setNextRun(new Date(Date.now() + intervalMs).toISOString());

  if (process.env.SCRAPE_ON_START !== 'false') {
    logInfo("Running initial scrape");
    fetchAllListings().catch(err => logError("Initial scrape failed", err));
  }
}

const PORT = process.env.PORT || 3000;
// Binds to loopback by default. This app has no TLS and holds your search
// criteria and notification addresses, so do not expose it directly to a
// network. Put it behind a reverse proxy or a tunnel if you need remote access.
const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
  logInfo(`HuurRadar running on http://${HOST}:${PORT}`);
  start();
});

module.exports = app;
