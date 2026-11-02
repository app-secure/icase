const fs = require('node:fs');
const path = require('node:path');
(async () => {
  if (process.argv.includes('--prepare')) {
    const mod = { exports: {} };
    const source = fs.readFileSync(path.resolve(__dirname, '../../icase-frontend/src/utils/mockupHtml.js'), 'utf8');
    new Function('module', 'exports', require('esbuild').transformSync(source, { format: 'cjs' }).code)(mod, mod.exports);
    const mockups = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../verification-results/mockups-html-v2/mockups-html.json')));
    const mockup = mockups.find(m => /Lomito/.test(m.preview_code));
    if (!mockup) throw new Error('No existe la pantalla de referencia');
    fs.writeFileSync(path.resolve(__dirname, '../verification-results/correcciones/mockup-original.html'), mod.exports.prepareMockupHtml(mockup.preview_code));
    return;
  }
  const { chromium } = require('/app/tests/node_modules/@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(fs.readFileSync('/evidence/mockup-original.html', 'utf8'));
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.flex')).display === 'flex');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/evidence/mockup-original-navegador.png' });
    await page.addScriptTag({ path: '/html2canvas.js' });
    const captured = await page.evaluate(async () => {
      let clone;
      const canvas = await html2canvas(document.body, { foreignObjectRendering: true, logging: false, width: 390, height: 844, scale: 1, onclone: doc => {
        const title = [...doc.querySelectorAll('h1,h2,h3')].find(n => n.textContent.includes('Lomito'));
        const s = doc.defaultView.getComputedStyle(title), r = title.getBoundingClientRect();
        clone = { width: r.width, height: r.height, font: s.font, flex: s.flex, html: title.outerHTML };
      } });
      return { clone, data: canvas.toDataURL('image/png').split(',')[1] };
    });
    fs.writeFileSync('/evidence/mockup-html2canvas.png', Buffer.from(captured.data, 'base64'));
    fs.writeFileSync('/evidence/mockup-clone.json', JSON.stringify(captured.clone, null, 2));
    const geometry = await page.evaluate(() => {
      const heading = [...document.querySelectorAll('h1,h2,h3')].find(n => n.textContent.includes('Lomito'));
      if (!heading) throw new Error('Título no encontrado');
      const paragraph = heading.parentElement.parentElement.querySelector('p');
      const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      const title = box(heading), description = paragraph ? box(paragraph) : null;
      return { title, description, overlap: description && title.y + title.height > description.y };
    });
    fs.writeFileSync('/evidence/mockup-geometria.json', JSON.stringify(geometry, null, 2));
    console.log(JSON.stringify(geometry));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
