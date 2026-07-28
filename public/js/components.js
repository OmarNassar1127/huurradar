// Component render functions
import { formatUptime, formatBytes, formatTime, escapeHtml } from './utils.js';

// Only allow http/https URLs through to href/onclick; otherwise fall back to '#'.
// encodeURI also neutralises quotes so the value is safe inside an HTML attribute
// and inside a JS string literal (onclick).
function safeUrl(url) {
  if (!url) return '#';
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return encodeURI(url);
    }
    return '#';
  } catch {
    return '#';
  }
}

// Store scraper configs for use in house tooltips
let scraperConfigs = {};
let specialAddresses = [];

export function setScraperConfigs(configs) {
  scraperConfigs = {};
  configs.forEach(c => {
    scraperConfigs[c.id] = {
      minRooms: c.min_rooms,
      minLivingArea: c.min_living_area,
      maxPrice: c.max_price
    };
  });
}

export function setSpecialAddresses(addresses) {
  specialAddresses = addresses.map(a => a.address.toLowerCase());
}

// Dashboard components
export function renderStats(stats) {
  document.getElementById('stat-total').textContent = stats.houses.total;
  document.getElementById('stat-approved').textContent = stats.houses.approved || 0;
  document.getElementById('stat-skipped').textContent = stats.houses.skipped || 0;
  document.getElementById('stat-pending').textContent = stats.houses.pending || 0;
  document.getElementById('stat-recipients').textContent = stats.recipients;
  document.getElementById('stat-archived').textContent = stats.houses.archived || 0;
}

export function renderScraperStatus(scraper) {
  if (scraper.lastRun) {
    document.getElementById('last-run').textContent = formatTime(scraper.lastRun);
  }
  if (scraper.lastRunDuration) {
    document.getElementById('last-duration').textContent = `${(scraper.lastRunDuration / 1000).toFixed(1)}s`;
  }
  
  const statusDot = document.getElementById('status-dot');
  const mobileStatusDot = document.getElementById('mobile-status-dot');
  const statusText = document.getElementById('scraper-status');
  
  if (scraper.isRunning) {
    statusDot.className = mobileStatusDot.className = 'w-2 h-2 rounded-full bg-terminal-yellow animate-pulse';
    statusText.textContent = 'Scraping...';
  } else {
    statusDot.className = mobileStatusDot.className = 'w-2 h-2 rounded-full bg-terminal-green animate-pulse-slow';
    statusText.textContent = 'Online';
  }
}

export function renderPlatformBreakdown(byPlatform, total) {
  const platforms = { vbt: 'VBT', bouwinvest: 'Bouwinvest', funda: 'Funda', mvgm: 'MVGM', alliantie: 'Alliantie', brockhoff: 'Brockhoff' };
  const colors = { vbt: 'bg-terminal-cyan', bouwinvest: 'bg-terminal-purple', funda: 'bg-terminal-orange', mvgm: 'bg-terminal-green', alliantie: 'bg-terminal-yellow', brockhoff: 'bg-pink-500' };
  
  document.getElementById('platform-breakdown').innerHTML = byPlatform.map(p => {
    const pct = total ? (p.count / total * 100).toFixed(0) : 0;
    return `
      <div class="flex items-center gap-3">
        <span class="w-20 text-xs font-mono">${platforms[p.platform] || p.platform}</span>
        <div class="flex-1 bg-terminal-border rounded-full h-2 overflow-hidden">
          <div class="${colors[p.platform] || 'bg-terminal-cyan'} h-full" style="width: ${pct}%"></div>
        </div>
        <span class="text-xs font-mono text-terminal-bright w-10 text-right">${p.count}</span>
      </div>
    `;
  }).join('');
}

// Pending actions banner (Brockhoff listings needing action)
export function renderPendingActions(pendingHouses) {
  const banner = document.getElementById('pending-actions-banner');
  if (!banner) return;

  if (!pendingHouses || pendingHouses.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div class="card rounded-xl p-4 bg-pink-500/10 border border-pink-500/30 mb-6">
      <div class="flex items-center gap-3 mb-3">
        <span class="text-2xl">🏠</span>
        <div>
          <h3 class="font-semibold text-pink-400">${pendingHouses.length} Brockhoff listing${pendingHouses.length > 1 ? 's' : ''} ready to apply</h3>
          <p class="text-xs text-terminal-text/60">Click Apply to auto-submit your application</p>
        </div>
      </div>
      <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        ${pendingHouses.slice(0, 6).map(h => `
          <div class="bg-terminal-surface/50 rounded-lg p-3 border border-terminal-border">
            <div class="flex items-start gap-3">
              <div class="w-16 h-16 rounded bg-terminal-border overflow-hidden flex-shrink-0">
                ${h.image_url
                  ? `<img src="${escapeHtml(h.image_url)}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<div class=\\'flex items-center justify-center h-full text-terminal-text/40 text-xl\\'>⌂</div>'">`
                  : '<div class="flex items-center justify-center h-full text-terminal-text/40 text-xl">⌂</div>'
                }
              </div>
              <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-terminal-bright text-xs truncate">${escapeHtml(h.street || 'Unknown')}</h4>
                <p class="text-[10px] text-terminal-text/60 truncate">${escapeHtml(h.city || '')}</p>
                <p class="text-xs text-pink-400 font-mono mt-1">€${h.price}</p>
              </div>
            </div>
            <div class="flex gap-2 mt-2">
              <button data-apply-house="${h.id}" class="flex-1 px-2 py-1.5 rounded text-[10px] font-mono bg-pink-500/20 text-pink-400 border border-pink-500/30 hover:bg-pink-500/30 transition-colors">
                APPLY
              </button>
              <button data-ignore-house="${h.id}" class="px-2 py-1.5 rounded text-[10px] font-mono bg-terminal-text/10 text-terminal-text/50 border border-terminal-text/20 hover:bg-terminal-text/20 transition-colors">
                ✗
              </button>
              <a href="${safeUrl(h.listing_url)}" target="_blank" class="px-2 py-1.5 rounded text-[10px] font-mono bg-terminal-surface border border-terminal-border hover:border-terminal-cyan transition-colors">
                →
              </a>
            </div>
          </div>
        `).join('')}
      </div>
      ${pendingHouses.length > 6 ? `<p class="text-xs text-terminal-text/50 mt-3 text-center">+${pendingHouses.length - 6} more in the list below</p>` : ''}
    </div>
  `;
}

// Houses components
export function renderHouses(houses) {
  const list = document.getElementById('houses-list');

  if (houses.length === 0) {
    list.innerHTML = '<div class="text-center py-12 text-terminal-text/60 col-span-full">No houses found</div>';
    return;
  }

  const platformColors = {
    funda: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    vbt: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
    bouwinvest: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    mvgm: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    alliantie: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    brockhoff: 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
  };

  // Default criteria (fallback)
  const defaultCriteria = { minRooms: 3, minLivingArea: 60, maxPrice: 1500 };

  list.innerHTML = houses.map(h => {
    const platformClass = platformColors[h.platform] || 'bg-terminal-border text-terminal-text';
    const isBrockhoff = h.platform === 'brockhoff';
    const actionStatus = h.action_status; // null, 'applied', 'ignored'

    // Get platform-specific criteria
    const criteria = scraperConfigs[h.platform] || defaultCriteria;

    // Check each criterion
    const streetLower = (h.street || '').toLowerCase();
    const isSpecialStreet = specialAddresses.some(s => streetLower.includes(s));
    const matchedSpecial = specialAddresses.find(s => streetLower.includes(s));
    const roomsPass = h.total_rooms >= criteria.minRooms;
    const areaPass = h.living_area >= criteria.minLivingArea;
    const pricePass = h.price > 0 && h.price <= criteria.maxPrice;

    // AI analysis status: 1 = approved, 0 = rejected, null = not analyzed
    const aiApproved = h.ai_approved;
    const aiAnalysis = h.ai_analysis || '';

    // Build criteria content for popup
    const criteriaContent = isSpecialStreet
      ? `<div class="text-terminal-cyan mb-1">★ Special: ${matchedSpecial}</div><div class="text-terminal-green">Always notified regardless of criteria</div>`
      : `<div class="${roomsPass ? 'text-terminal-green' : 'text-terminal-red'}">${roomsPass ? '✓' : '✗'} Rooms: ${h.total_rooms} (≥${criteria.minRooms})</div>
         <div class="${areaPass ? 'text-terminal-green' : 'text-terminal-red'}">${areaPass ? '✓' : '✗'} Size: ${h.living_area}m² (≥${criteria.minLivingArea})</div>
         <div class="${pricePass ? 'text-terminal-green' : 'text-terminal-red'}">${pricePass ? '✓' : '✗'} Price: €${h.price} (≤€${criteria.maxPrice})</div>`;

    // Extract short reason from AI analysis for rejected listings
    let aiVerdictTag = '';
    let aiVerdictClass = '';
    let shortReason = '';

    if (aiApproved === 1) {
      aiVerdictTag = '✓ QUALIFIES';
      aiVerdictClass = 'bg-terminal-green/20 text-terminal-green border-terminal-green/30';
    } else if (aiApproved === 0) {
      // Extract short reason from analysis
      const analysisLower = aiAnalysis.toLowerCase();
      if (analysisLower.includes('income') || analysisLower.includes('cap') || analysisLower.includes('€')) {
        shortReason = 'OVER INCOME';
      } else if (analysisLower.includes('couple') || analysisLower.includes('single') || analysisLower.includes('household')) {
        shortReason = 'WRONG HOUSEHOLD';
      } else if (analysisLower.includes('age') || analysisLower.includes('senior') || analysisLower.includes('55+')) {
        shortReason = 'AGE RESTRICTED';
      } else if (analysisLower.includes('student') || analysisLower.includes('starter')) {
        shortReason = 'WRONG CATEGORY';
      } else {
        shortReason = 'INELIGIBLE';
      }
      aiVerdictTag = `✗ ${shortReason}`;
      aiVerdictClass = 'bg-terminal-yellow/20 text-terminal-yellow border-terminal-yellow/30';
    } else {
      aiVerdictTag = '⏳ PENDING';
      aiVerdictClass = 'bg-terminal-text/10 text-terminal-text/50 border-terminal-text/20';
    }

    // Action status tag for Brockhoff listings
    let actionTag = '';
    if (isBrockhoff && actionStatus === 'applied') {
      actionTag = '<span class="px-2 py-1 rounded text-[10px] font-mono bg-terminal-green/20 text-terminal-green border border-terminal-green/30">APPLIED</span>';
    } else if (isBrockhoff && actionStatus === 'ignored') {
      actionTag = '<span class="px-2 py-1 rounded text-[10px] font-mono bg-terminal-text/10 text-terminal-text/40 border border-terminal-text/20">IGNORED</span>';
    }

    // Apply/Ignore buttons for Brockhoff listings without action
    let actionButtons = '';
    if (isBrockhoff && !actionStatus) {
      actionButtons = `
        <div class="flex gap-2 mt-2" onclick="event.stopPropagation()">
          <button data-apply-house="${h.id}" class="flex-1 px-2 py-1.5 rounded text-[10px] font-mono bg-pink-500/20 text-pink-400 border border-pink-500/30 hover:bg-pink-500/30 transition-colors">
            APPLY
          </button>
          <button data-ignore-house="${h.id}" class="px-2 py-1.5 rounded text-[10px] font-mono bg-terminal-text/10 text-terminal-text/50 border border-terminal-text/20 hover:bg-terminal-text/20 transition-colors">
            IGNORE
          </button>
        </div>
      `;
    }

    // Format date/time for display
    const createdDate = new Date(h.created_at);
    const day = createdDate.getDate();
    const month = createdDate.toLocaleString('en-US', { month: 'short' });
    const hours = createdDate.getHours().toString().padStart(2, '0');
    const minutes = createdDate.getMinutes().toString().padStart(2, '0');
    const dateTag = `${day} ${month} ${hours}:${minutes}`;

    // Encode data for the popup
    const popupData = JSON.stringify({
      street: h.street || 'Unknown',
      city: h.city || '',
      platform: h.platform.toUpperCase(),
      aiApproved,
      aiAnalysis,
      criteriaContent
    }).replace(/"/g, '&quot;');

    return `
      <div class="house-card card rounded-xl p-3 transition-all cursor-pointer flex flex-col ${actionStatus === 'ignored' ? 'opacity-50' : ''}" onclick="window.open('${safeUrl(h.listing_url)}', '_blank')">
        <div class="w-full h-28 rounded-lg bg-terminal-border overflow-hidden mb-3">
          ${h.image_url
            ? `<img src="${escapeHtml(h.image_url)}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<div class=\\'flex items-center justify-center h-full text-terminal-text/40 text-3xl\\'>⌂</div>'">`
            : '<div class="flex items-center justify-center h-full text-terminal-text/40 text-3xl">⌂</div>'
          }
        </div>
        <div class="flex-1 flex flex-col">
          <h4 class="font-semibold text-terminal-bright truncate text-xs">${escapeHtml(h.street || 'Unknown')}</h4>
          <p class="text-xs text-terminal-text/60 truncate mb-2">${escapeHtml(h.city || '')} ${escapeHtml(h.zipcode || '')}</p>
          <div class="flex items-center gap-2 text-xs font-mono mb-3">
            <span class="text-terminal-cyan font-semibold">€${h.price}</span>
            <span class="text-terminal-text/60">${h.living_area}m²</span>
            <span class="text-terminal-text/60">${h.total_rooms}r</span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap mt-auto">
            <span class="px-2 py-1 rounded text-[10px] font-mono ${platformClass}">${h.platform.toUpperCase()}</span>
            <span class="ai-verdict-tag px-2 py-1 rounded text-[10px] font-mono border cursor-pointer hover:opacity-80 active:scale-95 transition-all ${aiVerdictClass}" data-popup="${popupData}" onclick="event.stopPropagation(); showAiPopup(this)">${aiVerdictTag}</span>
            <span class="px-2 py-1 rounded text-[10px] font-mono bg-terminal-bg text-terminal-text/70 border border-terminal-border">${dateTag}</span>
            ${actionTag}
          </div>
          ${actionButtons}
        </div>
      </div>
    `;
  }).join('');
}

// Recipients components
export function renderRecipients(recipients) {
  const list = document.getElementById('recipients-list');
  
  if (recipients.length === 0) {
    list.innerHTML = '<div class="text-center py-8 text-terminal-text/60">No recipients</div>';
    return;
  }
  
  list.innerHTML = recipients.map(r => {
    const isActive = r.is_active !== 0;
    const opacityClass = isActive ? '' : 'opacity-50';
    
    return `
    <div class="flex items-center justify-between p-3 rounded-lg bg-terminal-bg border border-terminal-border gap-2 ${opacityClass}">
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-8 h-8 rounded-full bg-terminal-cyan/20 flex items-center justify-center text-terminal-cyan flex-shrink-0 text-sm">✉</span>
        <div class="min-w-0">
          <div class="font-mono text-terminal-bright text-xs truncate">${r.email}</div>
          ${r.name ? `<div class="text-xs text-terminal-text/60">${r.name}</div>` : ''}
        </div>
        ${r.is_primary ? '<span class="px-2 py-0.5 rounded text-[10px] bg-terminal-cyan/20 text-terminal-cyan flex-shrink-0">PRIMARY</span>' : ''}
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button data-toggle-recipient="${r.id}" class="px-2 py-1 rounded text-[10px] font-mono transition-colors ${isActive ? 'bg-terminal-green/20 text-terminal-green border border-terminal-green/30' : 'bg-terminal-text/10 text-terminal-text/50 border border-terminal-text/20'}">
          ${isActive ? 'ACTIVE' : 'INACTIVE'}
        </button>
        ${!r.is_primary ? `<button data-remove-recipient="${r.id}" class="text-terminal-red hover:bg-terminal-red/20 p-2 rounded">✗</button>` : ''}
      </div>
    </div>
  `}).join('');
}

// Scrapers components
export function renderScrapers(scrapers) {
  const list = document.getElementById('scrapers-list');
  
  const platformColors = {
    vbt: { bg: 'bg-terminal-cyan/10', border: 'border-terminal-cyan/30', text: 'text-terminal-cyan' },
    bouwinvest: { bg: 'bg-terminal-purple/10', border: 'border-terminal-purple/30', text: 'text-terminal-purple' },
    funda: { bg: 'bg-terminal-orange/10', border: 'border-terminal-orange/30', text: 'text-terminal-orange' },
    mvgm: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
    alliantie: { bg: 'bg-terminal-yellow/10', border: 'border-terminal-yellow/30', text: 'text-terminal-yellow' },
    brockhoff: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400' }
  };
  
  list.innerHTML = scrapers.map(s => {
    const colors = platformColors[s.id] || { bg: 'bg-terminal-border', border: 'border-terminal-border', text: 'text-terminal-text' };
    const isEnabled = s.enabled === 1;
    const statusOk = s.status === 'ok';
    const statusUnknown = s.status === 'unknown';
    
    const statusBadge = statusUnknown 
      ? '<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-terminal-text/10 text-terminal-text/50">UNKNOWN</span>'
      : statusOk 
        ? '<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-terminal-green/20 text-terminal-green">OK</span>'
        : `<span class="px-2 py-0.5 rounded text-[10px] font-mono bg-terminal-red/20 text-terminal-red" title="${escapeHtml(s.last_error || '')}">ERROR</span>`;
    
    return `
      <div class="card rounded-xl p-4 ${colors.bg} border ${colors.border}">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <span class="text-2xl ${colors.text}">⚡</span>
            <div>
              <h3 class="font-semibold text-terminal-bright">${s.name}</h3>
              <div class="flex items-center gap-2 mt-1">
                ${statusBadge}
                ${s.last_count !== null ? `<span class="text-[10px] text-terminal-text/60">${s.last_count} listings</span>` : ''}
              </div>
            </div>
          </div>
          <button data-toggle-scraper="${s.id}" class="px-3 py-1 rounded text-xs font-mono transition-colors ${isEnabled ? 'bg-terminal-green/20 text-terminal-green border border-terminal-green/30' : 'bg-terminal-text/10 text-terminal-text/50 border border-terminal-text/20'}">
            ${isEnabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
        
        <div class="mb-2 mt-4">
          <span class="text-[10px] uppercase tracking-wider text-terminal-text/40">Notification Criteria</span>
        </div>
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <label class="text-xs text-terminal-text/60 w-20">Min Rooms</label>
            <input type="number" data-scraper="${s.id}" data-field="minRooms" value="${s.min_rooms}" min="1" max="10" class="flex-1 bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-terminal-cyan w-20">
          </div>
          <div class="flex items-center gap-3">
            <label class="text-xs text-terminal-text/60 w-20">Min m²</label>
            <input type="number" data-scraper="${s.id}" data-field="minLivingArea" value="${s.min_living_area}" min="1" max="500" class="flex-1 bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-terminal-cyan w-20">
          </div>
          <div class="flex items-center gap-3">
            <label class="text-xs text-terminal-text/60 w-20">Max €</label>
            <input type="number" data-scraper="${s.id}" data-field="maxPrice" value="${s.max_price}" min="100" max="10000" step="50" class="flex-1 bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-terminal-cyan w-20">
          </div>
        </div>
        
        ${s.last_run ? `<div class="mt-4 pt-3 border-t border-terminal-border/30 text-[10px] text-terminal-text/50">Last run: ${formatTime(s.last_run)}</div>` : ''}
        ${s.last_error && !statusOk ? `<div class="mt-2 text-[10px] text-terminal-red truncate" title="${escapeHtml(s.last_error)}">Error: ${escapeHtml(s.last_error)}</div>` : ''}
      </div>
    `;
  }).join('');
}

// Special addresses component
export function renderSpecialAddresses(addresses) {
  const list = document.getElementById('special-addresses-list');
  
  if (addresses.length === 0) {
    list.innerHTML = '<div class="text-center py-4 text-terminal-text/60 text-sm">No special addresses</div>';
    return;
  }
  
  list.innerHTML = addresses.map(a => `
    <div class="flex items-center justify-between p-3 rounded-lg bg-terminal-bg border border-terminal-border">
      <div class="flex items-center gap-2">
        <span class="text-terminal-cyan">★</span>
        <span class="font-mono text-sm text-terminal-bright">${escapeHtml(a.address)}</span>
      </div>
      <button data-remove-special="${a.id}" class="text-terminal-red hover:bg-terminal-red/20 p-2 rounded">✗</button>
    </div>
  `).join('');
}

// System components
export function renderSystemStats(sys) {
  document.getElementById('sys-temp').innerHTML = sys.cpuTemp 
    ? `<span class="${parseFloat(sys.cpuTemp) > 70 ? 'text-terminal-red' : parseFloat(sys.cpuTemp) > 50 ? 'text-terminal-yellow' : 'text-terminal-green'}">${sys.cpuTemp}°C</span>` 
    : '—';
  
  document.getElementById('sys-cpu').innerHTML = `<span class="${sys.cpuUsage > 80 ? 'text-terminal-red' : sys.cpuUsage > 50 ? 'text-terminal-yellow' : 'text-terminal-green'}">${sys.cpuUsage.toFixed(1)}%</span>`;
  
  document.getElementById('sys-memory').innerHTML = `<span class="${parseFloat(sys.memoryUsagePercent) > 80 ? 'text-terminal-red' : parseFloat(sys.memoryUsagePercent) > 50 ? 'text-terminal-yellow' : 'text-terminal-green'}">${sys.memoryUsagePercent}%</span>`;
  
  document.getElementById('sys-disk').textContent = sys.disk?.usagePercent || '—';
  document.getElementById('sys-uptime').textContent = formatUptime(sys.uptime);
  document.getElementById('sys-hostname').textContent = sys.hostname;
  
  // Database storage
  if (sys.storage?.database) {
    document.getElementById('sys-db-size').textContent = sys.storage.database.total;
  }
  
  document.getElementById('sys-info').innerHTML = `
    <div class="truncate"><span class="text-terminal-text/60">Platform:</span> <span class="text-terminal-bright">${sys.platform}</span></div>
    <div class="truncate"><span class="text-terminal-text/60">Arch:</span> <span class="text-terminal-bright">${sys.arch}</span></div>
    <div class="col-span-full truncate"><span class="text-terminal-text/60">CPU:</span> <span class="text-terminal-bright">${sys.cpuModel}</span></div>
    <div class="truncate"><span class="text-terminal-text/60">Cores:</span> <span class="text-terminal-bright">${sys.cpuCount}</span></div>
    <div class="truncate"><span class="text-terminal-text/60">Total Mem:</span> <span class="text-terminal-bright">${formatBytes(sys.totalMemory)}</span></div>
    <div class="truncate"><span class="text-terminal-text/60">Free Mem:</span> <span class="text-terminal-bright">${formatBytes(sys.freeMemory)}</span></div>
    <div class="truncate"><span class="text-terminal-text/60">Disk:</span> <span class="text-terminal-bright">${sys.disk?.total || '—'}</span></div>
    <div class="truncate"><span class="text-terminal-text/60">DB Size:</span> <span class="text-terminal-bright">${sys.storage?.database?.total || '—'}</span></div>
  `;
}

// Live Viewer components
let liveViewerData = {}; // Store data for modal access

export function renderLiveViewer(data) {
  liveViewerData = data; // Store for modal
  const container = document.getElementById('live-viewer-content');
  const lastRunEl = document.getElementById('live-last-run');
  const durationEl = document.getElementById('live-duration');

  // Update header info
  if (data.lastRun) {
    lastRunEl.textContent = formatTime(data.lastRun);
  } else {
    lastRunEl.textContent = 'Never';
  }

  if (data.duration) {
    durationEl.textContent = `${(data.duration / 1000).toFixed(1)}s`;
  } else {
    durationEl.textContent = '—';
  }

  // Check if we have any data - order by priority
  const priorityOrder = ['mvgm', 'vbt', 'brockhoff', 'funda', 'bouwinvest', 'alliantie'];
  const scraperIds = Object.keys(data.scrapers || {}).sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a);
    const bIndex = priorityOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
  if (scraperIds.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 text-terminal-text/60">
        <span class="text-4xl mb-4 block">📡</span>
        <p class="text-lg mb-2">No scraper data yet</p>
        <p class="text-sm">Run the scraper to see live results here</p>
      </div>
    `;
    return;
  }

  const platformColors = {
    vbt: { bg: 'bg-terminal-cyan/10', border: 'border-terminal-cyan/30', text: 'text-terminal-cyan', gradient: 'from-terminal-cyan/20' },
    bouwinvest: { bg: 'bg-terminal-purple/10', border: 'border-terminal-purple/30', text: 'text-terminal-purple', gradient: 'from-terminal-purple/20' },
    funda: { bg: 'bg-terminal-orange/10', border: 'border-terminal-orange/30', text: 'text-terminal-orange', gradient: 'from-terminal-orange/20' },
    mvgm: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', gradient: 'from-blue-500/20' },
    alliantie: { bg: 'bg-terminal-yellow/10', border: 'border-terminal-yellow/30', text: 'text-terminal-yellow', gradient: 'from-terminal-yellow/20' },
    brockhoff: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400', gradient: 'from-pink-500/20' }
  };

  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${scraperIds.map(id => {
        const scraper = data.scrapers[id];
        const colors = platformColors[id] || { bg: 'bg-terminal-border', border: 'border-terminal-border', text: 'text-terminal-text', gradient: 'from-terminal-border' };
        const stats = scraper.stats || {};
        const passRate = stats.fetched > 0 ? Math.round((stats.passed / stats.fetched) * 100) : 0;

        return `
          <div class="card rounded-lg ${colors.bg} border ${colors.border} overflow-hidden cursor-pointer hover:scale-[1.01] transition-all duration-200 hover:shadow-lg" onclick="openScraperModal('${id}')">
            <div class="p-3">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <div class="w-9 h-9 rounded-lg bg-gradient-to-br ${colors.gradient} to-transparent flex items-center justify-center">
                    <span class="text-lg ${colors.text}">⚡</span>
                  </div>
                  <div>
                    <h3 class="font-semibold text-terminal-bright text-sm">${escapeHtml(scraper.name || id.toUpperCase())}</h3>
                    <p class="text-[10px] text-terminal-text/50">${formatTime(scraper.timestamp)}</p>
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-xl font-bold ${colors.text}">${stats.fetched || 0}</div>
                  <div class="text-[9px] text-terminal-text/50 uppercase">Fetched</div>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-1.5 mb-3">
                <div class="bg-terminal-bg/30 rounded p-1.5 text-center">
                  <div class="text-sm font-bold text-terminal-green">${stats.passed || 0}</div>
                  <div class="text-[8px] text-terminal-text/50 uppercase">Passed</div>
                </div>
                <div class="bg-terminal-bg/30 rounded p-1.5 text-center">
                  <div class="text-sm font-bold text-terminal-cyan">${stats.new || 0}</div>
                  <div class="text-[8px] text-terminal-text/50 uppercase">New</div>
                </div>
                <div class="bg-terminal-bg/30 rounded p-1.5 text-center">
                  <div class="text-sm font-bold text-terminal-text/60">${stats.existing || 0}</div>
                  <div class="text-[8px] text-terminal-text/50 uppercase">Exists</div>
                </div>
              </div>

              <div class="space-y-1">
                <div class="flex justify-between text-[10px]">
                  <span class="text-terminal-text/60">Pass rate</span>
                  <span class="${colors.text} font-mono">${passRate}%</span>
                </div>
                <div class="h-1.5 bg-terminal-bg/50 rounded-full overflow-hidden">
                  <div class="h-full ${colors.bg} ${colors.border} border-r-2 transition-all duration-500" style="width: ${passRate}%"></div>
                </div>
              </div>

              ${(stats.filteredByCity || stats.filteredByPrice) ? `
                <div class="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-terminal-border/20">
                  ${stats.filteredByCity ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-terminal-red/10 text-terminal-red">${stats.filteredByCity} wrong city</span>` : ''}
                  ${stats.filteredByPrice ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-terminal-yellow/10 text-terminal-yellow">${stats.filteredByPrice} over budget</span>` : ''}
                </div>
              ` : ''}

              <div class="mt-2 pt-2 border-t border-terminal-border/20 flex items-center justify-center gap-1.5 text-[10px] ${colors.text}">
                <span>View listings</span>
                <span>→</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function getLiveViewerData() {
  return liveViewerData;
}

export function renderScraperModal(id) {
  const data = liveViewerData;
  const scraper = data.scrapers?.[id];
  if (!scraper) return '';

  const platformColors = {
    vbt: { bg: 'bg-terminal-cyan/10', border: 'border-terminal-cyan/30', text: 'text-terminal-cyan' },
    bouwinvest: { bg: 'bg-terminal-purple/10', border: 'border-terminal-purple/30', text: 'text-terminal-purple' },
    funda: { bg: 'bg-terminal-orange/10', border: 'border-terminal-orange/30', text: 'text-terminal-orange' },
    mvgm: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
    alliantie: { bg: 'bg-terminal-yellow/10', border: 'border-terminal-yellow/30', text: 'text-terminal-yellow' },
    brockhoff: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400' }
  };

  const colors = platformColors[id] || { bg: 'bg-terminal-border', border: 'border-terminal-border', text: 'text-terminal-text' };
  const stats = scraper.stats || {};
  const listings = scraper.listings || [];

  return `
    <div class="flex items-center justify-between mb-4 pb-4 border-b border-terminal-border">
      <div class="flex items-center gap-3">
        <span class="text-3xl ${colors.text}">⚡</span>
        <div>
          <h3 class="text-xl font-bold text-terminal-bright">${escapeHtml(scraper.name || id.toUpperCase())}</h3>
          <p class="text-xs text-terminal-text/50">${listings.length} listings fetched</p>
        </div>
      </div>
      <button onclick="closeScraperModal()" class="w-10 h-10 flex items-center justify-center text-terminal-text/60 hover:text-terminal-bright hover:bg-terminal-border/30 rounded-lg transition-colors text-xl">&times;</button>
    </div>

    <div class="flex flex-wrap gap-2 mb-4">
      <span class="px-3 py-1.5 rounded-lg text-xs font-mono bg-terminal-bg/50 border border-terminal-border">${stats.fetched || 0} fetched</span>
      <span class="px-3 py-1.5 rounded-lg text-xs font-mono bg-terminal-green/20 text-terminal-green border border-terminal-green/30">${stats.passed || 0} passed</span>
      <span class="px-3 py-1.5 rounded-lg text-xs font-mono bg-terminal-cyan/20 text-terminal-cyan border border-terminal-cyan/30">${stats.new || 0} new</span>
      ${stats.filteredByCity ? `<span class="px-3 py-1.5 rounded-lg text-xs font-mono bg-terminal-red/20 text-terminal-red border border-terminal-red/30">${stats.filteredByCity} wrong city</span>` : ''}
      ${stats.filteredByPrice ? `<span class="px-3 py-1.5 rounded-lg text-xs font-mono bg-terminal-yellow/20 text-terminal-yellow border border-terminal-yellow/30">${stats.filteredByPrice} over budget</span>` : ''}
    </div>

    <div class="overflow-hidden rounded-xl border border-terminal-border">
      ${listings.length === 0 ? `
        <div class="p-8 text-center text-terminal-text/50">No listings fetched</div>
      ` : `
        <div class="max-h-[60vh] overflow-y-auto">
          <table class="w-full text-sm">
            <thead class="bg-terminal-surface sticky top-0 z-10">
              <tr class="text-left text-terminal-text/60 text-xs uppercase">
                <th class="px-4 py-3 font-medium">Address</th>
                <th class="px-4 py-3 font-medium hidden sm:table-cell">City</th>
                <th class="px-4 py-3 font-medium text-right">Price</th>
                <th class="px-4 py-3 font-medium text-center">Status</th>
                <th class="px-4 py-3 font-medium text-center w-12"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-terminal-border/30">
              ${listings.map(l => {
                let statusBadge = '';
                let rowClass = '';
                if (l._passed) {
                  if (l._isNew) {
                    statusBadge = '<span class="px-2 py-1 rounded text-[10px] font-mono bg-terminal-cyan/20 text-terminal-cyan border border-terminal-cyan/30">NEW</span>';
                  } else {
                    statusBadge = '<span class="px-2 py-1 rounded text-[10px] font-mono bg-terminal-green/20 text-terminal-green border border-terminal-green/30">EXISTS</span>';
                  }
                } else {
                  rowClass = 'opacity-50';
                  const reason = l._filterReason === 'city' ? 'WRONG CITY' :
                                 l._filterReason === 'price' ? 'OVER BUDGET' :
                                 l._filterReason === 'criteria' ? 'CRITERIA' : 'FILTERED';
                  const colorClass = l._filterReason === 'city' ? 'bg-terminal-red/20 text-terminal-red border-terminal-red/30' :
                                l._filterReason === 'price' ? 'bg-terminal-yellow/20 text-terminal-yellow border-terminal-yellow/30' :
                                'bg-terminal-text/10 text-terminal-text/50 border-terminal-text/20';
                  statusBadge = `<span class="px-2 py-1 rounded text-[10px] font-mono border ${colorClass}">${reason}</span>`;
                }
                return `
                  <tr class="hover:bg-terminal-border/20 transition-colors ${rowClass}">
                    <td class="px-4 py-3">
                      <div class="font-medium text-terminal-bright truncate max-w-[200px] sm:max-w-[300px]" title="${escapeHtml(l.street || 'Unknown')}">${escapeHtml(l.street || 'Unknown')}</div>
                      <div class="text-xs text-terminal-text/50 sm:hidden">${escapeHtml(l.city || '—')}</div>
                    </td>
                    <td class="px-4 py-3 text-terminal-text/60 hidden sm:table-cell">${escapeHtml(l.city || '—')}</td>
                    <td class="px-4 py-3 text-right font-mono ${colors.text} font-medium">€${l.price || 0}</td>
                    <td class="px-4 py-3 text-center">${statusBadge}</td>
                    <td class="px-4 py-3 text-center">
                      <a href="${l.listingUrl || '#'}" target="_blank" class="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-terminal-cyan/20 text-terminal-text/40 hover:text-terminal-cyan transition-colors" title="Open listing">→</a>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// User display
export function renderUserDisplay(user) {
  if (!user) return;
  const initial = user.displayName.charAt(0).toUpperCase();
  document.getElementById('user-avatar').textContent = initial;
  document.getElementById('user-name').textContent = `Welcome, ${user.displayName}`;
  document.getElementById('settings-avatar').textContent = initial;
  document.getElementById('settings-display-name').textContent = user.displayName;
  document.getElementById('settings-username').textContent = `@${user.username}`;
}

// Applications components
export function renderApplicationStats(stats) {
  document.getElementById('app-stat-total').textContent = stats.total || 0;
  document.getElementById('app-stat-success').textContent = stats.success || 0;
  document.getElementById('app-stat-failed').textContent = stats.failed || 0;
  document.getElementById('app-stat-pending').textContent = stats.pending || 0;
}

export function renderApplications(applications) {
  const list = document.getElementById('applications-list');
  const noApps = document.getElementById('no-applications');

  if (!applications || applications.length === 0) {
    list.innerHTML = '';
    noApps.classList.remove('hidden');
    return;
  }

  noApps.classList.add('hidden');

  const statusColors = {
    success: { bg: 'bg-terminal-green/10', border: 'border-terminal-green/30', text: 'text-terminal-green', icon: '✅' },
    failed: { bg: 'bg-terminal-red/10', border: 'border-terminal-red/30', text: 'text-terminal-red', icon: '❌' },
    pending: { bg: 'bg-terminal-yellow/10', border: 'border-terminal-yellow/30', text: 'text-terminal-yellow', icon: '⏳' }
  };

  list.innerHTML = applications.map(app => {
    const status = app.application_status || 'pending';
    const colors = statusColors[status] || statusColors.pending;
    const appliedAt = app.applied_at ? formatTime(app.applied_at) : '—';
    const hasLetter = app.motivation_letter && app.motivation_letter.length > 0;
    const letterId = `letter-${app.id}`;

    return `
      <div class="card rounded-xl p-4 ${colors.bg} border ${colors.border}">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-lg">${colors.icon}</span>
              <h4 class="font-semibold text-terminal-bright truncate">${escapeHtml(app.street || 'Unknown')}</h4>
            </div>
            <p class="text-xs text-terminal-text/60 mb-2">${escapeHtml(app.city || '')} · €${app.price}/m · ${app.platform}</p>
            <div class="flex items-center gap-3 text-[10px] text-terminal-text/50">
              <span>Applied: ${appliedAt}</span>
              <span class="px-2 py-0.5 rounded font-mono ${colors.text} ${colors.bg} border ${colors.border}">${status.toUpperCase()}</span>
            </div>
          </div>
          <a href="${app.listing_url}" target="_blank" class="px-3 py-1 rounded text-xs bg-terminal-surface border border-terminal-border hover:border-terminal-cyan transition-colors flex-shrink-0">View →</a>
        </div>
        ${hasLetter ? `
          <div class="mt-3 pt-3 border-t border-terminal-border/30">
            <button onclick="document.getElementById('${letterId}').classList.toggle('hidden')" class="text-xs text-terminal-cyan hover:underline">View Motivation Letter ▼</button>
            <div id="${letterId}" class="hidden mt-2 p-3 bg-terminal-bg rounded-lg text-xs text-terminal-text/80 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">${escapeHtml(app.motivation_letter)}</div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}
