const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src', file), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', require('esbuild').transformSync(read('utils/requirementReferences.js'), { format: 'cjs' }).code)(mod, mod.exports);

describe('presentación y alcance del documento', () => {
  test('separa RF y RNF sin eliminar referencias desconocidas ni duplicar IDs', () => {
    expect(mod.exports.groupRequirementReferences(['RF-01', 'RNF-02', 'RF-01', ' HU-03 ', '', null])).toEqual([
      ['RF', ['RF-01']], ['RNF', ['RNF-02']], ['Otras referencias', ['HU-03']]
    ]);
    expect(mod.exports.groupRequirementReferences()).toEqual([]);
  });
  test('reserva una página para cada pantalla antes de escribir su título', () => {
    const source = read('components/PdfPreviewModal.jsx');
    expect(source).toMatch(/checkPageBreak\(pageHeight\);[\s\S]*?const screenTitle/);
    expect(source).toContain('screenTitle.length * 4.8');
    expect(source).toContain('captionLines.length * 4');
  });
  test('no afirma una certificación normativa automática', () => {
    const source = read('components/PdfPreviewModal.jsx');
    expect(source).toContain('10. Revisión y Aprobación Técnica');
    expect(source).toContain('no constituyen certificación normativa');
    expect(source).not.toContain('ha sido formalmente estructurado y validado conforme');
  });
  test('preserva el código de diagramas cuando la imagen externa no está disponible', () => {
    const source = read('components/PdfPreviewModal.jsx');
    expect(source).toContain('if (image || !source) continue;');
    expect(source).toContain('No se pudo obtener la imagen del diagrama.');
    expect(source).toContain('String(source).split(/\\r?\\n/)');
  });
  test('incrusta fuentes externas en el cuerpo capturado y reutiliza la descarga', async () => {
    const fonts = { exports: {} };
    const fetcher = jest.fn(async url => url.includes('googleapis')
      ? { ok: true, text: async () => '@font-face { font-family: Inter; src: url(https://fonts.gstatic.com/test.woff2); }' }
      : { ok: true, blob: async () => ({}) });
    class Reader { readAsDataURL() { this.result = 'data:font/woff2;base64,TEST'; this.onload(); } }
    new Function('module', 'exports', 'fetch', 'FileReader', require('esbuild').transformSync(read('utils/captureFonts.js'), { format: 'cjs' }).code)(fonts, fonts.exports, fetcher, Reader);
    const doc = {
      querySelectorAll: () => [{ href: 'https://fonts.googleapis.com/css?family=Inter' }, { href: 'https://untrusted.test/style.css' }],
      createElement: () => ({}), body: { prepend: jest.fn() }, fonts: { ready: Promise.resolve() }
    };
    const css = await fonts.exports.embedCaptureFonts(doc);
    await fonts.exports.embedCaptureFonts(doc);
    expect(css).toContain('data:font/woff2;base64,TEST');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(doc.body.prepend.mock.calls[0][0]).toMatchObject({ id: 'icase-capture-fonts', textContent: expect.stringContaining('data:font/woff2;base64,TEST') });
    expect(doc.body.prepend.mock.calls[0][0].textContent).not.toContain('https://fonts.gstatic.com');
    expect(read('components/PdfPreviewModal.jsx')).toContain('fontStyle.textContent = captureFontCss');
  });
});
