const path = require('node:path');

// Caché local e ignorada por Git. No instala Chromium como navegador del usuario.
function configureBrowserCache() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.resolve(__dirname, '../../node_modules/.cache/ms-playwright');
  process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
  return cache;
}
module.exports = { configureBrowserCache };
