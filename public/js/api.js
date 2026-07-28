// API module

let authToken = localStorage.getItem('huurradar_token');

export function getToken() {
  return authToken;
}

export function setToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem('huurradar_token', token);
  } else {
    localStorage.removeItem('huurradar_token');
  }
}

export async function api(endpoint, options = {}) {
  const res = await fetch(`/api${endpoint}`, {
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new Error('Session expired');
  }
  
  return res.json();
}

// Auth API
export async function login(username, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  
  setToken(data.token);
  return data;
}

export async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
  } catch (e) {}
  setToken(null);
}

export async function checkAuth() {
  if (!authToken) return null;
  
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!res.ok) throw new Error('Invalid token');
    const data = await res.json();
    return data.user;
  } catch (e) {
    setToken(null);
    return null;
  }
}

export async function changePassword(currentPassword, newPassword) {
  return api('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword }
  });
}

// Dashboard API
export async function getStatus() {
  return api('/status');
}

// Houses API
export async function getHouses(params = {}) {
  const query = new URLSearchParams();
  if (params.notified) query.set('notified', params.notified);
  if (params.platform) query.set('platform', params.platform);
  if (params.archived) query.set('archived', params.archived);
  if (params.city) query.set('city', params.city);
  if (params.aiStatus) query.set('aiStatus', params.aiStatus);
  if (params.limit) query.set('limit', params.limit);
  if (params.offset) query.set('offset', params.offset);

  return api(`/houses?${query.toString()}`);
}

export async function getCities() {
  return api('/houses/cities');
}

// Recipients API
export async function getRecipients() {
  return api('/recipients');
}

export async function addRecipient(email, name) {
  return api('/recipients', { method: 'POST', body: { email, name } });
}

export async function removeRecipient(id) {
  return api(`/recipients/${id}`, { method: 'DELETE' });
}

export async function toggleRecipient(id) {
  return api(`/recipients/${id}/toggle`, { method: 'PATCH' });
}

export async function sendTestEmail() {
  return api('/test-email', { method: 'POST' });
}

// System API
export async function getSystemStats() {
  return api('/system');
}

export async function getLogs(limit = 100) {
  return api(`/logs?limit=${limit}`);
}

// Scraper API
export async function triggerScrape() {
  return api('/scrape', { method: 'POST' });
}

export async function getLiveData() {
  return api('/scrape/live');
}

// Scrapers Config API
export async function getScrapers() {
  return api('/scrapers');
}

export async function updateScraper(id, config) {
  return api(`/scrapers/${id}`, { method: 'PATCH', body: config });
}

// Special Addresses API
export async function getSpecialAddresses() {
  return api('/scrapers/special-addresses/list');
}

export async function addSpecialAddress(address) {
  return api('/scrapers/special-addresses', { method: 'POST', body: { address } });
}

export async function removeSpecialAddress(id) {
  return api(`/scrapers/special-addresses/${id}`, { method: 'DELETE' });
}

// Applications API
export async function getApplications(limit = 50) {
  return api(`/houses/applications/list?limit=${limit}`);
}

export async function getApplicationStats() {
  return api('/houses/applications/stats');
}

// Pending Actions API (Brockhoff manual apply/ignore)
export async function getPendingActions() {
  return api('/houses/pending-actions');
}

export async function previewLetter(id) {
  return api(`/houses/${id}/preview`, { method: 'POST' });
}

export async function applyToHouse(id, letter = null) {
  return api(`/houses/${id}/apply`, { method: 'POST', body: letter ? { letter } : {} });
}

export async function ignoreHouse(id) {
  return api(`/houses/${id}/ignore`, { method: 'POST' });
}
