const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);

test('el servidor construye MkDocs sin pedir a Python que abra Chromium', async () => {
  const Jobs = require('../src/infrastructure/services/DocumentationJobs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'icase-pdf-'));
  const subprocess = jest.fn(async () => ({}));
  try {
    await new Jobs({ execute: subprocess }).buildSite(root);
    const [, args, options] = subprocess.mock.calls[0];
    expect(args).toEqual(['tools/export_pdf.py', '--build-only']);
    expect(options.env.ICASE_DOCUMENTATION_TEMP).toBe(path.join(root, 'runtime'));
    expect(options.env.TEMP).toBe(options.env.ICASE_DOCUMENTATION_TEMP);
  } finally {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'icase-pdf-')) throw new Error('Limpieza fuera del directorio temporal');
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('la exportación del servidor reutiliza un único navegador y lo cierra después de imprimir', async () => {
  const Jobs = require('../src/infrastructure/services/DocumentationJobs');
  const Generator = require('../src/infrastructure/services/ProjectDocumentationGenerator');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'icase-pdf-'));
  const events = [], browser = { close: jest.fn(async () => events.push('cerrar')) };
  const jobs = new Jobs({ root, browserFactory: async () => { events.push('abrir'); return browser; } });
  for (const method of ['diagrams', 'screenshots', 'report']) jobs[method] = async () => {};
  jobs.buildSite = async () => events.push('construir');
  jobs.printSite = async (_, actualBrowser) => { expect(actualBrowser).toBe(browser); events.push('imprimir'); };
  try {
    const state = await jobs.start('demo', new Generator().generar({ proyecto: { nombre: 'Demo' } }));
    await jobs.queue;
    expect((await jobs.status('demo', state.id)).estado).toBe('lista');
    expect(events).toEqual(['abrir', 'construir', 'imprimir', 'cerrar']);
  } finally {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'icase-pdf-')) throw new Error('Limpieza fuera del directorio temporal');
    await fs.rm(root, { recursive: true, force: true });
  }
});

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
