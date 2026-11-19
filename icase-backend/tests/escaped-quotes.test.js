const { transformSync } = require('esbuild');
const HtmlToJsxTransformer = require('../src/infrastructure/services/HtmlToJsxTransformer');
const MockupValidatorService = require('../src/infrastructure/services/MockupValidatorService');

const escaped = '<!DOCTYPE html><html lang=\\"es\\"><head><meta charset=\\"UTF-8\\"></head><body class=\\"bg-slate-50\\"><main><h1 class=\\"text-2xl font-semibold mb-4\\">Copias de Seguridad</h1><button data-accion=\\"RF-14.consultar\\">Ver</button></main></body></html>';
const compiles = (jsx) => transformSync(`const x = (<div>${jsx}</div>);`, { loader: 'jsx' });

describe('comillas escapadas en el HTML de un mockup', () => {
  test('el transformador produce JSX válido y conserva las clases', () => {
    const jsx = HtmlToJsxTransformer.transform(escaped, { operaciones: new Set(['rf-14']) });
    expect(jsx).toContain('className="text-2xl font-semibold mb-4"');
    expect(jsx).toContain('handleAction(event, "rf-14", "consultar")');
    expect(() => compiles(jsx)).not.toThrow();
  });

  test('el sanitizador repara el HTML y lo avisa', () => {
    const { html, advertencias } = new MockupValidatorService().sanitizar(escaped);
    expect(html).toContain('<h1 class="text-2xl font-semibold mb-4">');
    expect(html).not.toContain('\\"');
    expect(advertencias.join(' ')).toContain('Comillas escapadas');
  });

  test('comportamiento previo: un HTML correcto no se modifica ni avisa', () => {
    const ok = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head><body><main><p class="a">hola "texto"</p></main></body></html>';
    expect(HtmlToJsxTransformer.unescapeQuotes(ok)).toBe(ok);
    expect(new MockupValidatorService().sanitizar(ok).advertencias.join(' ')).not.toContain('Comillas escapadas');
  });
});

describe('validación de atributos corruptos', () => {
  const service = new MockupValidatorService();
  const doc = (body) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head><body><main>${body}</main></body></html>`;

  test('un mockup con restos de comillas escapadas ya almacenado se rechaza', () => {
    const corrupto = doc('<h1 class="\\&quot;text-2xl" font-semibold="" mb-4\\"="">Copias</h1>');
    expect(service.validar(corrupto).errores.join(' ')).toContain('comillas escapadas');
  });

  test('el mismo contenido llegado con comillas escapadas se repara en el sanitizador y es válido', () => {
    const { html } = service.sanitizar('<!DOCTYPE html><html lang=\\"es\\"><head><meta charset=\\"UTF-8\\"><script src=\\"https://cdn.tailwindcss.com\\"></script></head><body><main><h1 class=\\"text-2xl\\">Copias</h1></main></body></html>');
    expect(service.validar(html).errores.join(' ')).not.toContain('comillas escapadas');
  });

  test('comportamiento previo: un documento sano no recibe ese error', () => {
    expect(service.validar(doc('<h1 class="text-2xl">Hola</h1>')).errores.join(' ')).not.toContain('comillas escapadas');
  });
});
