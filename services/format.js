/**
 * Human-readable byte size.
 *
 * Shared between the database and system-stats modules, which previously kept
 * identical private copies. One implementation means they cannot drift into
 * reporting the same file at two different sizes.
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = { formatBytes };
