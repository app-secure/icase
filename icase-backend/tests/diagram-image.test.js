const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { transformSync } = require('esbuild');

function runtime(fail = false) {
  const context = { module: { exports: {} }, exports: {}, Blob, setTimeout,
    URL: { createObjectURL: jest.fn(() => 'blob:test'), revokeObjectURL: jest.fn() },
    Image: class { constructor() { this.naturalWidth = 1200; this.naturalHeight = 600; } set src(value) { queueMicrotask(() => fail ? this.onerror() : this.onload()); } },
    document: { createElement: jest.fn(() => ({ getContext: () => ({ fillRect() {}, drawImage() {} }), toBlob: cb => cb(new Blob(['png'], { type: 'image/png' })) })) } };
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../../icase-frontend/src/utils/diagramImage.js'), 'utf8'), { format: 'cjs' }).code, context);
  return context;
}

test('exporta PNG completo a doble resolución y libera el SVG temporal', async () => {
  const ctx = runtime();
  const png = await ctx.module.exports.diagramPng('<svg width="1200" height="600"></svg>');
  expect(png.type).toBe('image/png');
  const canvas = ctx.document.createElement.mock.results[0].value;
  expect([canvas.width, canvas.height]).toEqual([2400, 1200]);
  expect(ctx.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  expect(ctx.module.exports.imageFilename('Árbol / Navegación')).toBe('Arbol-Navegacion.png');
});

test('informa errores de conversión y libera recursos', async () => {
  const ctx = runtime(true);
  await expect(ctx.module.exports.diagramPng('<svg/>')).rejects.toThrow('convertir');
  expect(ctx.URL.revokeObjectURL).toHaveBeenCalled();
  await expect(ctx.module.exports.diagramPng('')).rejects.toThrow('disponible');
});
