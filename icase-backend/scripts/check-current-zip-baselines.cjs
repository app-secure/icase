const fs = require('node:fs');
const path = require('node:path');
const Browser = require('../src/core/constants/BrowserTestRuntime');
const Mobile = require('../src/core/constants/MobileRuntime');
const base = path.resolve(__dirname, '../verification-results/zip-current');
const root = path.resolve(process.argv[2] || '');
if (!root.startsWith(base + path.sep + 'extracted-')) throw new Error('Carpeta fuera de la prueba');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tests = JSON.parse(read('tests/package.json'));
const workflow = read('.github/workflows/ci-cd.yml');
const mobile = fs.existsSync(path.join(root, 'mobile/package.json')) ? JSON.parse(read('mobile/package.json')) : null;
const report = {
  fecha: new Date().toISOString(),
  playwright: { esperado: Browser.version, actual: tests.devDependencies?.['@playwright/test'] },
  runner: { ubuntu24: (workflow.match(/runs-on: ubuntu-24\.04/g) || []).length, usaLatest: workflow.includes('ubuntu-latest') },
  limitesCI: workflow.includes('HTTP_RATE_MAX: 3000') && workflow.includes('AUTH_RATE_MAX: 300'),
  movil: mobile ? { expo: mobile.dependencies.expo, react: mobile.dependencies.react, reactNative: mobile.dependencies['react-native'], node: mobile.engines?.node } : null
};
report.correcto = report.playwright.actual === Browser.version && report.runner.ubuntu24 === 3 && !report.runner.usaLatest && report.limitesCI && (!mobile || (mobile.dependencies.expo === Mobile.expo && mobile.dependencies.react === Mobile.react && mobile.dependencies['react-native'] === Mobile.reactNative));
fs.writeFileSync(path.join(base, 'bases-generadas.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (!report.correcto) process.exitCode = 1;
