// In-memory log buffer
const logBuffer = [];
const MAX_LOGS = 200;

function addLog(level, message, data = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data
  };
  logBuffer.unshift(entry);
  if (logBuffer.length > MAX_LOGS) logBuffer.pop();
  
  const prefix = level === 'error' ? '[ERROR]' : '[INFO]';
  console.log(`${prefix} ${entry.timestamp} - ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

function logInfo(message, data = null) {
  addLog('info', message, data);
}

function logError(message, error) {
  addLog('error', message, { message: error?.message, stack: error?.stack });
  console.error(error);
}

function getLogs(limit = 100) {
  return logBuffer.slice(0, limit);
}

module.exports = {
  logInfo,
  logError,
  getLogs
};
