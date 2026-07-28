const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { formatBytes } = require('./format');
function getSystemStats() {
  const stats = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptime: os.uptime(),
    loadAvg: os.loadavg(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    usedMemory: os.totalmem() - os.freemem(),
    memoryUsagePercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(1),
    cpuCount: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown',
  };
  
  // Get CPU temperature (Raspberry Pi specific)
  try {
    const tempOutput = execSync('cat /sys/class/thermal/thermal_zone0/temp', { encoding: 'utf8' });
    stats.cpuTemp = (parseInt(tempOutput.trim()) / 1000).toFixed(1);
  } catch (e) {
    stats.cpuTemp = null;
  }
  
  // Get disk usage
  try {
    const dfOutput = execSync('df -h / | tail -1', { encoding: 'utf8' });
    const parts = dfOutput.trim().split(/\s+/);
    stats.disk = {
      total: parts[1],
      used: parts[2],
      available: parts[3],
      usagePercent: parts[4],
    };
  } catch (e) {
    stats.disk = null;
  }
  
  // Get CPU usage
  try {
    const statOutput = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'", { encoding: 'utf8' });
    stats.cpuUsage = parseFloat(statOutput.trim()) || 0;
  } catch (e) {
    stats.cpuUsage = stats.loadAvg[0] / stats.cpuCount * 100;
  }
  
  return stats;
}

function getStorageStats(dataDir) {
  const dbPath = path.join(dataDir, 'houses.db');
  const walPath = path.join(dataDir, 'houses.db-wal');
  const shmPath = path.join(dataDir, 'houses.db-shm');
  
  let dbSize = 0;
  let walSize = 0;
  let shmSize = 0;
  
  try {
    if (fs.existsSync(dbPath)) dbSize = fs.statSync(dbPath).size;
    if (fs.existsSync(walPath)) walSize = fs.statSync(walPath).size;
    if (fs.existsSync(shmPath)) shmSize = fs.statSync(shmPath).size;
  } catch (e) {
    // Ignore errors
  }
  
  const totalDbSize = dbSize + walSize + shmSize;
  
  return {
    database: {
      main: formatBytes(dbSize),
      wal: formatBytes(walSize),
      total: formatBytes(totalDbSize),
      totalBytes: totalDbSize
    }
  };
}

module.exports = {
  getSystemStats,
  getStorageStats
};
