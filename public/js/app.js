// Main application logic
import * as API from './api.js';
import * as Components from './components.js';

// State
let currentTab = 'dashboard';
let currentUser = null;
let sidebarOpen = false;
let housesPage = 0;
let housesTotal = 0;
const HOUSES_PER_PAGE = 15;

// Sidebar toggle
window.toggleSidebar = function() {
  sidebarOpen = !sidebarOpen;
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  
  if (sidebarOpen) {
    sidebar.classList.add('open');
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.remove('opacity-0'), 10);
  } else {
    sidebar.classList.remove('open');
    overlay.classList.add('opacity-0');
    setTimeout(() => overlay.classList.add('hidden'), 300);
  }
};

function closeSidebarMobile() {
  if (window.innerWidth < 768 && sidebarOpen) {
    window.toggleSidebar();
  }
}

// Auth functions
async function checkAuth() {
  currentUser = await API.checkAuth();
  if (currentUser) {
    showApp();
    Components.renderUserDisplay(currentUser);
  } else {
    showLoginScreen();
  }
  window.dispatchEvent(new Event('app:ready'));
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

async function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  showVersion();
  
  // Load scraper configs first (needed for house tooltips)
  await loadScraperConfigs();
  loadDashboard();
}

window.login = async function() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  
  if (!username || !password) {
    errorEl.textContent = 'Please enter username and password';
    errorEl.classList.remove('hidden');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  errorEl.classList.add('hidden');
  
  try {
    const data = await API.login(username, password);
    currentUser = data.user;
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    showApp();
    Components.renderUserDisplay(currentUser);
    showToast(`Welcome back, ${currentUser.displayName}!`);
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
};

window.logout = async function() {
  await API.logout();
  currentUser = null;
  showLoginScreen();
};

window.changePassword = async function() {
  const currentPw = document.getElementById('current-password').value;
  const newPw = document.getElementById('new-password').value;
  const confirmPw = document.getElementById('confirm-password').value;
  
  if (!currentPw || !newPw || !confirmPw) {
    showToast('Fill all fields', 'error');
    return;
  }
  
  if (newPw !== confirmPw) {
    showToast('Passwords do not match', 'error');
    return;
  }
  
  if (newPw.length < 6) {
    showToast('Min 6 characters', 'error');
    return;
  }
  
  try {
    await API.changePassword(currentPw, newPw);
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    showToast('Password changed');
  } catch (e) {
    showToast(e.message, 'error');
  }
};

// Tab navigation
window.showTab = function(tab) {
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('[id^="nav-"]').forEach(el => el.classList.remove('tab-active'));
  
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  document.getElementById(`nav-${tab}`).classList.add('tab-active');
  
  currentTab = tab;
  closeSidebarMobile();
  
  if (tab === 'houses') { loadCities(); loadHouses(); }
  if (tab === 'applications') loadApplications();
  if (tab === 'recipients') loadRecipients();
  if (tab === 'scrapers') loadScrapers();
  if (tab === 'system') loadSystem();
  if (tab === 'live') loadLiveViewer();
};

// Toast notifications
window.showToast = function(message, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const msg = document.getElementById('toast-message');
  
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
  icon.className = `text-lg ${type === 'success' ? 'text-terminal-green' : type === 'error' ? 'text-terminal-red' : 'text-terminal-cyan'}`;
  msg.textContent = message;
  
  toast.classList.remove('translate-y-full', 'opacity-0');
  setTimeout(() => toast.classList.add('translate-y-full', 'opacity-0'), 3000);
};

// Data loading functions
async function loadDashboard() {
  try {
    const status = await API.getStatus();
    Components.renderStats(status);
    Components.renderScraperStatus(status.scraper);
    Components.renderPlatformBreakdown(status.houses.byPlatform, status.houses.total);
  } catch (e) {
    console.error('Failed to load dashboard', e);
  }
}

async function loadScraperConfigs() {
  try {
    const [scrapers, addresses] = await Promise.all([
      API.getScrapers(),
      API.getSpecialAddresses()
    ]);
    Components.setScraperConfigs(scrapers);
    Components.setSpecialAddresses(addresses);
  } catch (e) {
    console.error('Failed to load scraper configs', e);
  }
}

async function loadHouses(resetPage = true) {
  try {
    if (resetPage) housesPage = 0;

    const aiStatus = document.getElementById('filter-ai-status')?.value || '';
    const platform = document.getElementById('filter-platform').value;
    const archived = document.getElementById('filter-archived')?.checked || false;
    const city = document.getElementById('filter-city')?.value || '';
    const offset = housesPage * HOUSES_PER_PAGE;

    // Load pending actions for banner
    const pendingActions = await API.getPendingActions();
    Components.renderPendingActions(pendingActions);

    const data = await API.getHouses({ aiStatus, platform, archived: archived ? 'true' : '', city, limit: HOUSES_PER_PAGE, offset });
    housesTotal = data.total;
    Components.renderHouses(data.houses);
    renderPagination();
  } catch (e) {
    console.error('Failed to load houses', e);
  }
}

async function loadCities() {
  try {
    const cities = await API.getCities();
    const select = document.getElementById('filter-city');
    if (!select) return;

    select.innerHTML = '<option value="">All Cities</option>' +
      cities.map(c => `<option value="${c}">${c}</option>`).join('');
  } catch (e) {
    console.error('Failed to load cities', e);
  }
}

function renderPagination() {
  const container = document.getElementById('houses-pagination');
  if (!container) return;

  const totalPages = Math.ceil(housesTotal / HOUSES_PER_PAGE);
  const start = housesPage * HOUSES_PER_PAGE + 1;
  const end = Math.min((housesPage + 1) * HOUSES_PER_PAGE, housesTotal);

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 text-sm">
      <span class="text-terminal-text/60">${housesTotal > 0 ? `${start}-${end} of ${housesTotal}` : 'No results'}</span>
      <div class="flex gap-2">
        <button onclick="prevPage()" ${housesPage === 0 ? 'disabled' : ''} class="px-4 py-2 rounded-lg bg-terminal-surface border border-terminal-border hover:border-terminal-cyan disabled:opacity-40 disabled:cursor-not-allowed">← Prev</button>
        <span class="px-4 py-2 text-terminal-text/60">${totalPages > 0 ? `${housesPage + 1} / ${totalPages}` : '-'}</span>
        <button onclick="nextPage()" ${housesPage >= totalPages - 1 ? 'disabled' : ''} class="px-4 py-2 rounded-lg bg-terminal-surface border border-terminal-border hover:border-terminal-cyan disabled:opacity-40 disabled:cursor-not-allowed">Next →</button>
      </div>
    </div>
  `;
}

window.prevPage = function() {
  if (housesPage > 0) {
    housesPage--;
    loadHouses(false);
  }
};

window.nextPage = function() {
  const totalPages = Math.ceil(housesTotal / HOUSES_PER_PAGE);
  if (housesPage < totalPages - 1) {
    housesPage++;
    loadHouses(false);
  }
};

async function loadRecipients() {
  try {
    const recipients = await API.getRecipients();
    Components.renderRecipients(recipients);
  } catch (e) {
    console.error('Failed to load recipients', e);
  }
}

async function loadScrapers() {
  try {
    const [scrapers, addresses] = await Promise.all([
      API.getScrapers(),
      API.getSpecialAddresses()
    ]);
    Components.setScraperConfigs(scrapers);
    Components.renderScrapers(scrapers);
    Components.renderSpecialAddresses(addresses);
  } catch (e) {
    console.error('Failed to load scrapers', e);
  }
}

async function loadSystem() {
  try {
    const sys = await API.getSystemStats();
    Components.renderSystemStats(sys);
  } catch (e) {
    console.error('Failed to load system stats', e);
  }
}

async function loadLiveViewer() {
  try {
    const data = await API.getLiveData();
    Components.renderLiveViewer(data);
  } catch (e) {
    console.error('Failed to load live data', e);
  }
}

// Open scraper modal in live viewer
window.openScraperModal = function(id) {
  const modal = document.getElementById('scraper-modal');
  const content = document.getElementById('scraper-modal-content');
  content.innerHTML = Components.renderScraperModal(id);
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

window.closeScraperModal = function() {
  const modal = document.getElementById('scraper-modal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
};

async function loadApplications() {
  try {
    const [applications, stats] = await Promise.all([
      API.getApplications(),
      API.getApplicationStats()
    ]);
    Components.renderApplicationStats(stats);
    Components.renderApplications(applications);
  } catch (e) {
    console.error('Failed to load applications', e);
  }
}

// Action handlers
window.triggerScrape = async function() {
  const btn = document.getElementById('btn-scrape');
  btn.disabled = true;
  btn.textContent = 'Running...';

  try {
    await API.triggerScrape();
    showToast('Scrape started');

    const poll = setInterval(async () => {
      const status = await API.getStatus();
      if (!status.scraper.isRunning) {
        clearInterval(poll);
        btn.disabled = false;
        btn.textContent = 'Run Now';
        loadDashboard();
        loadScraperConfigs();
        showToast('Scrape completed');
      }
    }, 2000);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Run Now';
    showToast('Scrape failed', 'error');
  }
};

window.addRecipient = async function() {
  const email = document.getElementById('new-email').value.trim();
  const name = document.getElementById('new-name').value.trim();
  
  if (!email) {
    showToast('Email required', 'error');
    return;
  }
  
  try {
    await API.addRecipient(email, name);
    document.getElementById('new-email').value = '';
    document.getElementById('new-name').value = '';
    showToast('Recipient added');
    loadRecipients();
    loadDashboard();
  } catch (e) {
    showToast('Failed to add', 'error');
  }
};

window.removeRecipient = async function(id) {
  if (!confirm('Remove this recipient?')) return;
  
  try {
    await API.removeRecipient(id);
    showToast('Removed');
    loadRecipients();
    loadDashboard();
  } catch (e) {
    showToast('Failed', 'error');
  }
};

window.toggleRecipient = async function(id) {
  try {
    const result = await API.toggleRecipient(id);
    showToast(result.recipient.is_active ? 'Recipient activated' : 'Recipient deactivated');
    loadRecipients();
  } catch (e) {
    showToast('Failed to toggle', 'error');
  }
};

window.toggleScraper = async function(id) {
  try {
    const scrapers = await API.getScrapers();
    const scraper = scrapers.find(s => s.id === id);
    if (!scraper) return;
    
    await API.updateScraper(id, { enabled: !scraper.enabled });
    showToast(scraper.enabled ? 'Scraper disabled' : 'Scraper enabled');
    loadScrapers();
  } catch (e) {
    showToast('Failed to toggle', 'error');
  }
};

window.updateScraperConfig = async function(id, field, value) {
  try {
    await API.updateScraper(id, { [field]: parseInt(value) });
    showToast('Config updated');
    loadScraperConfigs();
  } catch (e) {
    showToast('Failed to update', 'error');
  }
};

window.addSpecialAddress = async function() {
  const input = document.getElementById('new-special-address');
  const address = input.value.trim();
  
  if (!address) {
    showToast('Enter an address', 'error');
    return;
  }
  
  try {
    await API.addSpecialAddress(address);
    input.value = '';
    showToast('Special address added');
    loadScrapers();
  } catch (e) {
    showToast(e.message || 'Failed to add', 'error');
  }
};

window.removeSpecialAddress = async function(id) {
  if (!confirm('Remove this special address?')) return;
  
  try {
    await API.removeSpecialAddress(id);
    showToast('Removed');
    loadScrapers();
  } catch (e) {
    showToast('Failed', 'error');
  }
};

window.sendTestEmail = async function() {
  try {
    await API.sendTestEmail();
    showToast('Test email sent');
  } catch (e) {
    showToast('Failed', 'error');
  }
};

// Apply to house - shows letter preview modal
window.applyToHouse = async function(id) {
  const modal = document.getElementById('letter-modal');
  const modalContent = document.getElementById('letter-modal-content');
  const letterTextarea = document.getElementById('letter-textarea');
  const submitBtn = document.getElementById('letter-submit-btn');
  const cancelBtn = document.getElementById('letter-cancel-btn');
  const houseInfo = document.getElementById('letter-house-info');

  // Show loading state
  modal.classList.remove('hidden');
  modalContent.innerHTML = `
    <div class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="animate-spin w-8 h-8 border-2 border-pink-400 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p class="text-terminal-text/60">Generating motivation letter...</p>
        <p class="text-[10px] text-terminal-text/40 mt-2">This may take a few seconds</p>
      </div>
    </div>
  `;

  try {
    const result = await API.previewLetter(id);
    const house = result.house;

    modalContent.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-terminal-bright">Review Motivation Letter</h3>
          <p class="text-xs text-terminal-text/60">${house.street}, ${house.city} · €${house.price}</p>
        </div>
        <button onclick="closeLetterModal()" class="text-terminal-text/60 hover:text-terminal-bright text-xl">&times;</button>
      </div>
      <div class="mb-4">
        <label class="text-xs text-terminal-text/60 mb-2 block">Edit the letter if needed:</label>
        <textarea id="letter-textarea" class="w-full h-48 bg-terminal-bg border border-terminal-border rounded-lg p-3 text-sm font-mono text-terminal-text focus:outline-none focus:border-pink-400 resize-none">${result.letter}</textarea>
        <p class="text-[10px] text-terminal-text/40 mt-1"><span id="letter-char-count">${result.letter.length}</span> characters</p>
      </div>
      <div class="flex gap-3">
        <button id="letter-submit-btn" onclick="submitApplication(${house.id})" class="flex-1 px-4 py-2 rounded-lg bg-pink-500/20 text-pink-400 border border-pink-500/30 hover:bg-pink-500/30 transition-colors font-mono text-sm">
          SUBMIT APPLICATION
        </button>
        <button onclick="closeLetterModal()" class="px-4 py-2 rounded-lg bg-terminal-surface border border-terminal-border hover:border-terminal-text/40 transition-colors font-mono text-sm">
          CANCEL
        </button>
      </div>
    `;

    // Update character count on input
    document.getElementById('letter-textarea').addEventListener('input', (e) => {
      document.getElementById('letter-char-count').textContent = e.target.value.length;
    });

  } catch (e) {
    modalContent.innerHTML = `
      <div class="text-center py-8">
        <span class="text-4xl mb-4 block">❌</span>
        <p class="text-terminal-red mb-4">Failed to generate letter</p>
        <p class="text-xs text-terminal-text/60 mb-4">${e.message || 'Unknown error'}</p>
        <button onclick="closeLetterModal()" class="px-4 py-2 rounded-lg bg-terminal-surface border border-terminal-border hover:border-terminal-text/40 transition-colors">Close</button>
      </div>
    `;
  }
};

window.submitApplication = async function(id) {
  const letterTextarea = document.getElementById('letter-textarea');
  const submitBtn = document.getElementById('letter-submit-btn');
  const letter = letterTextarea.value;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="animate-pulse">Submitting...</span>';

  try {
    await API.applyToHouse(id, letter);
    closeLetterModal();
    showToast('Application submitted successfully!');
    loadHouses();
  } catch (e) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'SUBMIT APPLICATION';
    showToast(e.message || 'Failed to submit', 'error');
  }
};

window.closeLetterModal = function() {
  document.getElementById('letter-modal').classList.add('hidden');
};

// AI Analysis Popup
window.showAiPopup = function(element) {
  const data = JSON.parse(element.dataset.popup);
  const modal = document.getElementById('ai-popup-modal');
  const content = document.getElementById('ai-popup-content');

  const statusLabel = data.aiApproved === 1 ? 'Approved' : data.aiApproved === 0 ? 'Skipped' : 'Pending';
  const statusColor = data.aiApproved === 1 ? 'text-terminal-green' : data.aiApproved === 0 ? 'text-terminal-yellow' : 'text-terminal-text/60';
  const statusIcon = data.aiApproved === 1 ? '✓' : data.aiApproved === 0 ? '✗' : '⏳';

  content.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <div>
        <h3 class="font-semibold text-terminal-bright text-sm">${data.street}</h3>
        <p class="text-[10px] text-terminal-text/60">${data.city}</p>
      </div>
      <button onclick="closeAiPopup()" class="w-8 h-8 flex items-center justify-center text-terminal-text/60 hover:text-terminal-bright text-lg">&times;</button>
    </div>

    <div class="mb-4">
      <div class="flex items-center gap-2 mb-2">
        <span class="${statusColor} text-lg">${statusIcon}</span>
        <span class="text-xs font-semibold ${statusColor}">AI Verdict: ${statusLabel}</span>
      </div>
      ${data.aiAnalysis
        ? `<div class="bg-terminal-bg rounded-lg p-3 text-[11px] text-terminal-text/80 leading-relaxed">${data.aiAnalysis}</div>`
        : `<div class="bg-terminal-bg rounded-lg p-3 text-[11px] text-terminal-text/50 italic">No AI analysis yet</div>`
      }
    </div>

    <div class="border-t border-terminal-border pt-3">
      <div class="text-[10px] text-terminal-text/60 uppercase tracking-wider mb-2">Basic Criteria (${data.platform})</div>
      <div class="text-[11px] font-mono space-y-1">
        ${data.criteriaContent}
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
};

window.closeAiPopup = function() {
  document.getElementById('ai-popup-modal').classList.add('hidden');
};

// Ignore house
window.ignoreHouse = async function(id) {
  try {
    await API.ignoreHouse(id);
    showToast('Listing ignored');
    loadHouses();
  } catch (e) {
    showToast('Failed to ignore', 'error');
  }
};

window.refreshLiveViewer = loadLiveViewer;
window.filterHouses = loadHouses;

// Debounce utility for input changes
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

const debouncedScraperUpdate = debounce((id, field, value) => {
  window.updateScraperConfig(id, field, value);
}, 500);

// Event delegation for dynamic elements
document.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-remove-recipient]');
  if (removeBtn) {
    e.stopPropagation();
    window.removeRecipient(removeBtn.dataset.removeRecipient);
  }
  
  const toggleRecipientBtn = e.target.closest('[data-toggle-recipient]');
  if (toggleRecipientBtn) {
    e.stopPropagation();
    window.toggleRecipient(toggleRecipientBtn.dataset.toggleRecipient);
  }
  
  const toggleScraperBtn = e.target.closest('[data-toggle-scraper]');
  if (toggleScraperBtn) {
    e.stopPropagation();
    window.toggleScraper(toggleScraperBtn.dataset.toggleScraper);
  }
  
  const removeSpecialBtn = e.target.closest('[data-remove-special]');
  if (removeSpecialBtn) {
    e.stopPropagation();
    window.removeSpecialAddress(removeSpecialBtn.dataset.removeSpecial);
  }

  // Apply to house button
  const applyBtn = e.target.closest('[data-apply-house]');
  if (applyBtn) {
    e.stopPropagation();
    window.applyToHouse(applyBtn.dataset.applyHouse);
  }

  // Ignore house button
  const ignoreBtn = e.target.closest('[data-ignore-house]');
  if (ignoreBtn) {
    e.stopPropagation();
    window.ignoreHouse(ignoreBtn.dataset.ignoreHouse);
  }

  // Close all info tooltips when clicking outside
  if (!e.target.closest('.info-btn')) {
    document.querySelectorAll('.info-tooltip.info-visible').forEach(el => el.classList.remove('info-visible'));
  }
});

// Handle scraper config input changes
document.addEventListener('input', (e) => {
  const input = e.target.closest('[data-scraper][data-field]');
  if (input) {
    const id = input.dataset.scraper;
    const field = input.dataset.field;
    const value = input.value;
    debouncedScraperUpdate(id, field, value);
  }
});

// Listen for auth logout event
window.addEventListener('auth:logout', () => {
  currentUser = null;
  showLoginScreen();
});

// Auto-refresh
setInterval(() => {
  if (!API.getToken()) return;
  if (currentTab === 'dashboard') loadDashboard();
  if (currentTab === 'system') loadSystem();
  if (currentTab === 'scrapers') loadScrapers();
  if (currentTab === 'applications') loadApplications();
  if (currentTab === 'live') loadLiveViewer();
}, 30000);

// Initialize
checkAuth();

// Show the running version in the sidebar. Read from the server rather than
// hardcoded in the markup, so a release bump cannot leave it stale.
async function showVersion() {
  const el = document.getElementById('app-version');
  if (!el) return;
  try {
    const sys = await API.getSystemStats();
    if (sys.version) el.textContent = `v${sys.version}`;
  } catch (e) {
    // Non-fatal: the sidebar simply shows no version.
  }
}
