const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);

test('el driver Node de Python crea artefactos con TEMP inválido y restaura el entorno incluso al fallar', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'icase-pdf-'));
  try {
    const poison = path.join(root, 'not-a-directory'); await fs.writeFile(poison, 'TEMP inválido');
    const script = path.resolve(__dirname, '../src/infrastructure/templates/documentation/export_pdf.py');
    const code = `
import importlib.util, os, pathlib, subprocess, sys, tempfile, types
fake = types.ModuleType('playwright.sync_api')
fake.sync_playwright = None
sys.modules['playwright'] = types.ModuleType('playwright')
sys.modules['playwright.sync_api'] = fake
spec = importlib.util.spec_from_file_location('export_pdf', ${JSON.stringify(script)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
original = {key: os.environ.get(key) for key in ('TEMP', 'TMP', 'TMPDIR')}
old_tempdir = tempfile.tempdir
calls = []
def export():
    current = pathlib.Path(os.environ['ICASE_DOCUMENTATION_TEMP']).resolve()
    actual = pathlib.Path(os.environ['TMP']).resolve()
    assert actual.parent == current
    assert all(os.environ[key] == str(actual) for key in original)
    # El mismo tipo de proceso hijo que usa Playwright: Node consulta os.tmpdir().
    result = subprocess.check_output([${JSON.stringify(process.execPath)}, '-e', "const fs=require('fs'),os=require('os'),p=require('path'); console.log(fs.mkdtempSync(p.join(os.tmpdir(),'playwright-artifacts-')));"], text=True).strip()
    assert pathlib.Path(result).parent == actual
    calls.append(actual)
module.export_pdf = export
module.main()
assert {key: os.environ.get(key) for key in original} == original
assert tempfile.tempdir == old_tempdir
assert not calls[0].exists()
def fail():
    raise RuntimeError('Fallo de navegador simulado')
module.export_pdf = fail
try:
    module.main()
    raise AssertionError('Debía fallar')
except RuntimeError:
    pass
assert {key: os.environ.get(key) for key in original} == original
assert tempfile.tempdir == old_tempdir
print('ok')
`;
    const result = await execute(process.env.DOCUMENTATION_PYTHON || 'python', ['-c', code], { windowsHide: true, timeout: 30000, env: { ...process.env, TEMP: poison, TMP: poison, TMPDIR: poison, ICASE_DOCUMENTATION_TEMP: path.join(root, 'private') } });
    expect(result.stdout.trim()).toBe('ok');
  } finally {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'icase-pdf-')) throw new Error('Limpieza fuera del directorio temporal');
    await fs.rm(root, { recursive: true, force: true });
  }
});
