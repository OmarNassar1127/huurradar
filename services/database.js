const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { logInfo } = require('./logger');
const { hashPassword } = require('./auth');

const { formatBytes } = require('./format');
let db = null;

function getDb() {
  return db;
}

function initializeDatabase(dataDir) {
  logInfo("Initializing SQLite database...");

  const DB_PATH = process.env.HUURRADAR_DB_PATH || path.join(dataDir, 'houses.db');
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  
  // Houses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS houses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id TEXT UNIQUE NOT NULL,
      street TEXT,
      zipcode TEXT,
      city TEXT,
      price REAL,
      living_area INTEGER,
      total_rooms INTEGER,
      property_type TEXT,
      image_url TEXT,
      listing_url TEXT,
      platform TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_notified INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0
    )
  `);
  
  // Add is_archived column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE houses ADD COLUMN is_archived INTEGER DEFAULT 0`);
    logInfo("Added is_archived column to houses table");
  } catch (e) {
    // Column already exists, ignore
  }
  
  // Recipients table
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      is_primary INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add is_active column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE recipients ADD COLUMN is_active INTEGER DEFAULT 1`);
    logInfo("Added is_active column to recipients table");
  } catch (e) {
    // Column already exists, ignore
  }
  
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Scrapers config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scrapers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      min_rooms INTEGER DEFAULT 3,
      min_living_area INTEGER DEFAULT 60,
      max_price INTEGER DEFAULT 1500,
      status TEXT DEFAULT 'unknown',
      last_run DATETIME,
      last_count INTEGER DEFAULT 0,
      last_error TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Special addresses table (always notify regardless of criteria)
  db.exec(`
    CREATE TABLE IF NOT EXISTS special_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listing_id ON houses(listing_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_criteria ON houses(total_rooms, living_area, price)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notified ON houses(is_notified)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_archived ON houses(is_archived)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_session_token ON sessions(token)`);
  
  // Seed users if table is empty
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  if (userCount === 0) {
    let seedPassword = process.env.HUURRADAR_SEED_PASSWORD;
    if (!seedPassword) {
      seedPassword = crypto.randomBytes(18).toString('base64');
      console.warn(`HUURRADAR_SEED_PASSWORD not set. Generated a random seed password for admin accounts: ${seedPassword}`);
    }
    const hashedPassword = hashPassword(seedPassword);
    const username = process.env.HUURRADAR_SEED_USER || 'admin';
    db.prepare("INSERT INTO users (username, display_name, password) VALUES (?, ?, ?)")
      .run(username, username, hashedPassword);
    logInfo(`Created initial user: ${username} (change the password after first login)`);
  }
  
  // Seed primary recipients from env if table is empty
  const count = db.prepare("SELECT COUNT(*) as count FROM recipients").get().count;
  if (count === 0) {
    const insertRecipient = db.prepare("INSERT OR IGNORE INTO recipients (email, name, is_primary) VALUES (?, ?, ?)");
    if (process.env.NOTIFICATION_EMAIL) {
      insertRecipient.run(process.env.NOTIFICATION_EMAIL, 'Primary', 1);
    }
    if (process.env.NOTIFICATION_EMAIL_CC) {
      insertRecipient.run(process.env.NOTIFICATION_EMAIL_CC, 'CC', 0);
    }
  }
  
  // Clean expired sessions
  db.exec("DELETE FROM sessions WHERE expires_at < datetime('now')");
  
  // Every platform the app can scrape. One list, used both to seed a fresh
  // database and to backfill a row for a platform added in a later version.
  // These used to be two separate lists that had already drifted apart on
  // their default criteria.
  const PLATFORMS = [
    ['funda', 'Funda'],
    ['vbt', 'VBT'],
    ['bouwinvest', 'Bouwinvest'],
    ['mvgm', 'MVGM'],
    ['alliantie', 'Alliantie'],
    ['brockhoff', 'Brockhoff']
  ];

  // Neutral starting criteria — tune each platform from the Scrapers page.
  const defaultMinRooms = parseInt(process.env.DEFAULT_MIN_ROOMS) || 2;
  const defaultMinArea = parseInt(process.env.DEFAULT_MIN_LIVING_AREA) || 40;
  const defaultMaxPrice = parseInt(process.env.DEFAULT_MAX_PRICE) || 2000;

  const insertScraper = db.prepare(`
    INSERT OR IGNORE INTO scrapers (id, name, min_rooms, min_living_area, max_price)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const [id, name] of PLATFORMS) {
    const info = insertScraper.run(id, name, defaultMinRooms, defaultMinArea, defaultMaxPrice);
    if (info.changes > 0) logInfo(`Added scraper config: ${name}`);
  }

  // Auto-apply columns migration
  try {
    db.exec(`ALTER TABLE houses ADD COLUMN auto_applied INTEGER DEFAULT 0`);
    logInfo("Added auto_applied column to houses table");
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE houses ADD COLUMN application_status TEXT`);
    logInfo("Added application_status column to houses table");
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE houses ADD COLUMN motivation_letter TEXT`);
    logInfo("Added motivation_letter column to houses table");
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE houses ADD COLUMN applied_at TEXT`);
    logInfo("Added applied_at column to houses table");
  } catch (e) {
    // Column already exists
  }

  // Action status column (for manual apply/ignore flow)
  try {
    db.exec(`ALTER TABLE houses ADD COLUMN action_status TEXT`);
    logInfo("Added action_status column to houses table");
  } catch (e) {
    // Column already exists
  }

  // AI analysis columns (for tracking AI qualification decisions)
  try {
    db.exec(`ALTER TABLE houses ADD COLUMN ai_analysis TEXT`);
    logInfo("Added ai_analysis column to houses table");
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE houses ADD COLUMN ai_approved INTEGER DEFAULT NULL`);
    logInfo("Added ai_approved column to houses table");
  } catch (e) {
    // Column already exists
  }

  // Special addresses start empty — add your own from the Settings page.

  logInfo("Database initialization completed");
  
  return db;
}

// House queries
function getHouses({ notified, platform, archived = false, limit = 100, offset = 0 }) {
  let query = "SELECT * FROM houses WHERE is_archived = ?";
  const params = [archived ? 1 : 0];
  
  if (notified !== undefined) {
    query += " AND is_notified = ?";
    params.push(notified === 'true' || notified === true ? 1 : 0);
  }
  
  if (platform) {
    query += " AND platform = ?";
    params.push(platform);
  }
  
  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), parseInt(offset));
  
  return db.prepare(query).all(...params);
}

function getHouseById(id) {
  return db.prepare("SELECT * FROM houses WHERE id = ?").get(id);
}

function getHouseByListingId(listingId) {
  return db.prepare("SELECT * FROM houses WHERE listing_id = ?").get(listingId);
}

function insertHouse(listing) {
  return db.prepare(`
    INSERT INTO houses (listing_id, street, zipcode, city, price, living_area, total_rooms, property_type, image_url, listing_url, platform)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    listing.listingId, listing.street, listing.zipcode, listing.city,
    listing.price, listing.livingArea, listing.totalRooms, listing.propertyType,
    listing.imageUrl, listing.listingUrl, listing.platform
  );
}

function updateHouse(listing) {
  return db.prepare(`
    UPDATE houses SET price = ?, living_area = ?, total_rooms = ?, property_type = ?, image_url = ?, listing_url = ?, platform = ?, updated_at = CURRENT_TIMESTAMP
    WHERE listing_id = ?
  `).run(
    listing.price, listing.livingArea, listing.totalRooms, listing.propertyType,
    listing.imageUrl, listing.listingUrl, listing.platform, listing.listingId
  );
}

function markHouseNotified(listingId) {
  return db.prepare("UPDATE houses SET is_notified = 1 WHERE listing_id = ?").run(listingId);
}

function archiveOldHouses(daysOld = 14) {
  const result = db.prepare(`
    UPDATE houses 
    SET is_archived = 1 
    WHERE is_archived = 0 
    AND created_at < datetime('now', '-' || ? || ' days')
  `).run(daysOld);
  
  return result.changes;
}

function getHouseStats() {
  const total = db.prepare("SELECT COUNT(*) as count FROM houses WHERE is_archived = 0").get().count;
  const archived = db.prepare("SELECT COUNT(*) as count FROM houses WHERE is_archived = 1").get().count;

  // AI-based stats
  const approved = db.prepare("SELECT COUNT(*) as count FROM houses WHERE ai_approved = 1 AND is_archived = 0").get().count;
  const skipped = db.prepare("SELECT COUNT(*) as count FROM houses WHERE ai_approved = 0 AND is_archived = 0").get().count;
  const pending = db.prepare("SELECT COUNT(*) as count FROM houses WHERE ai_approved IS NULL AND is_archived = 0").get().count;

  // Legacy stats for backward compatibility
  const notified = db.prepare("SELECT COUNT(*) as count FROM houses WHERE is_notified = 1 AND is_archived = 0").get().count;

  const byPlatform = db.prepare(`
    SELECT platform, COUNT(*) as count
    FROM houses
    WHERE is_archived = 0
    GROUP BY platform
  `).all();

  return { total, approved, skipped, pending, notified, archived, byPlatform };
}

// Recipient queries
function getRecipients() {
  return db.prepare("SELECT * FROM recipients ORDER BY is_primary DESC, created_at ASC").all();
}

function getRecipientEmails() {
  // Only return active recipients
  return getRecipients().filter(r => r.is_active).map(r => r.email);
}

function toggleRecipient(id) {
  const recipient = db.prepare("SELECT * FROM recipients WHERE id = ?").get(id);
  if (!recipient) return null;
  
  const newStatus = recipient.is_active ? 0 : 1;
  db.prepare("UPDATE recipients SET is_active = ? WHERE id = ?").run(newStatus, id);
  
  return { ...recipient, is_active: newStatus };
}

function addRecipient(email, name) {
  return db.prepare("INSERT INTO recipients (email, name) VALUES (?, ?)").run(email, name || null);
}

function removeRecipient(id) {
  const recipient = db.prepare("SELECT * FROM recipients WHERE id = ?").get(id);
  if (recipient) {
    db.prepare("DELETE FROM recipients WHERE id = ?").run(id);
  }
  return recipient;
}

// Database stats
function getDatabaseStats() {
  const fs = require('fs');
  const dbPath = path.join(process.cwd(), 'data', 'houses.db');
  
  let dbSize = 0;
  try {
    const stats = fs.statSync(dbPath);
    dbSize = stats.size;
  } catch (e) {
    // File might not exist yet
  }
  
  const houseCount = db.prepare("SELECT COUNT(*) as count FROM houses").get().count;
  const archivedCount = db.prepare("SELECT COUNT(*) as count FROM houses WHERE is_archived = 1").get().count;
  
  return {
    dbSize,
    dbSizeFormatted: formatBytes(dbSize),
    totalHouses: houseCount,
    archivedHouses: archivedCount,
    activeHouses: houseCount - archivedCount
  };
}

// Scraper config queries
function getScrapers() {
  return db.prepare("SELECT * FROM scrapers ORDER BY name ASC").all();
}

function getScraperConfig(id) {
  return db.prepare("SELECT * FROM scrapers WHERE id = ?").get(id);
}

function updateScraperConfig(id, config) {
  const { enabled, minRooms, minLivingArea, maxPrice } = config;
  return db.prepare(`
    UPDATE scrapers 
    SET enabled = ?, min_rooms = ?, min_living_area = ?, max_price = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(enabled ? 1 : 0, minRooms, minLivingArea, maxPrice, id);
}

function updateScraperStatus(id, status, count, error = null) {
  return db.prepare(`
    UPDATE scrapers 
    SET status = ?, last_run = CURRENT_TIMESTAMP, last_count = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, count, error, id);
}

// Special addresses queries
function getSpecialAddresses() {
  return db.prepare("SELECT * FROM special_addresses ORDER BY address ASC").all();
}

function addSpecialAddress(address) {
  const normalized = address.toLowerCase().trim();
  return db.prepare("INSERT INTO special_addresses (address) VALUES (?)").run(normalized);
}

function removeSpecialAddress(id) {
  const address = db.prepare("SELECT * FROM special_addresses WHERE id = ?").get(id);
  if (address) {
    db.prepare("DELETE FROM special_addresses WHERE id = ?").run(id);
  }
  return address;
}

// Application tracking queries
function markHouseApplied(listingId, status, letter) {
  return db.prepare(`
    UPDATE houses
    SET auto_applied = 1, application_status = ?, motivation_letter = ?, applied_at = datetime('now')
    WHERE listing_id = ?
  `).run(status, letter, listingId);
}

function getApplications(limit = 50) {
  return db.prepare(`
    SELECT * FROM houses
    WHERE auto_applied = 1
    ORDER BY applied_at DESC
    LIMIT ?
  `).all(limit);
}

function getApplicationStats() {
  const total = db.prepare("SELECT COUNT(*) as count FROM houses WHERE auto_applied = 1").get().count;
  const success = db.prepare("SELECT COUNT(*) as count FROM houses WHERE auto_applied = 1 AND application_status = 'success'").get().count;
  const failed = db.prepare("SELECT COUNT(*) as count FROM houses WHERE auto_applied = 1 AND application_status = 'failed'").get().count;
  const pending = db.prepare("SELECT COUNT(*) as count FROM houses WHERE auto_applied = 1 AND application_status = 'pending'").get().count;

  return { total, success, failed, pending };
}

function updateApplicationStatus(listingId, status) {
  return db.prepare(`
    UPDATE houses
    SET application_status = ?
    WHERE listing_id = ?
  `).run(status, listingId);
}

// Get Brockhoff listings that need user action (not applied, not ignored)
function getPendingActionHouses() {
  return db.prepare(`
    SELECT * FROM houses
    WHERE platform = 'brockhoff'
    AND is_archived = 0
    AND (action_status IS NULL OR action_status = '')
    ORDER BY created_at DESC
  `).all();
}

// Mark a house as ignored (won't show in pending actions)
function markHouseIgnored(id) {
  return db.prepare(`
    UPDATE houses
    SET action_status = 'ignored'
    WHERE id = ?
  `).run(id);
}

// Mark a house as applied (with letter and timestamp)
function markHouseAppliedManual(id, status, letter) {
  return db.prepare(`
    UPDATE houses
    SET action_status = 'applied', auto_applied = 1, application_status = ?, motivation_letter = ?, applied_at = datetime('now')
    WHERE id = ?
  `).run(status, letter, id);
}

// Update AI analysis results for a house
function updateHouseAiAnalysis(listingId, approved, analysis) {
  return db.prepare(`
    UPDATE houses
    SET ai_approved = ?, ai_analysis = ?
    WHERE listing_id = ?
  `).run(approved ? 1 : 0, analysis, listingId);
}

module.exports = {
  getDb,
  initializeDatabase,
  getHouses,
  getHouseById,
  getHouseByListingId,
  insertHouse,
  updateHouse,
  markHouseNotified,
  archiveOldHouses,
  getHouseStats,
  getRecipients,
  getRecipientEmails,
  addRecipient,
  removeRecipient,
  toggleRecipient,
  getDatabaseStats,
  getScrapers,
  getScraperConfig,
  updateScraperConfig,
  updateScraperStatus,
  getSpecialAddresses,
  addSpecialAddress,
  removeSpecialAddress,
  markHouseApplied,
  getApplications,
  getApplicationStats,
  updateApplicationStatus,
  getPendingActionHouses,
  markHouseIgnored,
  markHouseAppliedManual,
  updateHouseAiAnalysis
};
