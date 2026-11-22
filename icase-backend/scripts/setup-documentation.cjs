const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const execute = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} terminó con ${result.status}`);
};
execute(process.env.DOCUMENTATION_PYTHON || 'python', ['-m', 'pip', 'install', '--upgrade', '--target', path.join(root, '.documentation-python'), '-r', path.join(root, 'src/infrastructure/templates/documentation/requirements.txt')]);
execute(process.execPath, [path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js'), 'install', 'chromium'], { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(root, '.icase-browsers') });
console.log('PDF, capturas y grabación preparados para el servidor.');
