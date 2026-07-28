const express = require('express');
const { getDb } = require('../services/database');
const { hashPassword, verifyPassword, generateToken } = require('../services/auth');
const { logInfo } = require('../services/logger');

const router = express.Router();

// Login endpoint (no auth required)
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const db = getDb();
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username.toLowerCase());
  
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  
  // Create session (7 days expiry)
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  
  db.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)").run(user.id, token, expiresAt);
  
  logInfo(`User logged in: ${user.username}`);
  
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name
    }
  });
});

// Logout endpoint
router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const db = getDb();
  
  if (token) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
  
  res.json({ success: true });
});

// Get current user (requires auth - middleware applied in main app)
router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

// Change password (requires auth)
router.post('/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const db = getDb();
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  
  if (!verifyPassword(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  
  const hashedPassword = hashPassword(newPassword);
  db.prepare("UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?").run(hashedPassword, req.user.id);
  
  // Invalidate all other sessions for this user
  const currentToken = req.headers.authorization?.replace('Bearer ', '');
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(req.user.id, currentToken);
  
  logInfo(`Password changed for user: ${req.user.username}`);
  
  res.json({ success: true, message: 'Password changed successfully' });
});

module.exports = router;
