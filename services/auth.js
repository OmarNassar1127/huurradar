const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === verify;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Auth middleware factory - takes db as parameter
function createAuthMiddleware(db) {
  return function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const session = db.prepare(`
      SELECT s.*, u.id as user_id, u.username, u.display_name 
      FROM sessions s 
      JOIN users u ON s.user_id = u.id 
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).get(token);
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    req.user = {
      id: session.user_id,
      username: session.username,
      displayName: session.display_name
    };
    
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  createAuthMiddleware
};
