const path = require('node:path');
const { configureBrowserCache } = require('../scripts/lib/playwright-runtime.cjs');
const previous = process.env.PLAYWRIGHT_BROWSERS_PATH;
afterEach(() => { if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH; else process.env.PLAYWRIGHT_BROWSERS_PATH = previous; });

test('instalador y ejecutor usan una caché dentro del proyecto por defecto', () => {
  delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  expect(configureBrowserCache()).toBe(path.resolve(__dirname, '../node_modules/.cache/ms-playwright'));
  expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe(configureBrowserCache());
});
test('respeta una caché explícita configurada por el entorno de pruebas', () => {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(__dirname, '.cache-sintetica-no-creada');
  expect(configureBrowserCache()).toBe(process.env.PLAYWRIGHT_BROWSERS_PATH);
});
