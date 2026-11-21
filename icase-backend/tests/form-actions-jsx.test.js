const HtmlToJsxTransformer = require('../src/infrastructure/services/HtmlToJsxTransformer');

const analyze = (html) => HtmlToJsxTransformer.analyze(`<body><main>${html}</main></body>`, { operaciones: new Set(['rf-12']), routes: new Set(), referencias: {} }).jsx;

describe('formularios del mockup con data-accion', () => {
  test('el botón de envío ejecuta la acción declarada en el formulario y el envío nativo se evita', () => {
    const jsx = analyze('<form data-accion="RF-12.editar"><input name="precio" value="3"><button type="submit">Guardar</button></form>');
    expect(jsx).toContain('onSubmit={(event) => event.preventDefault()}');
    expect(jsx).toContain('handleAction(event, "rf-12", "editar")');
    expect((jsx.match(/handleAction\(/g) || []).length).toBe(1); // solo el botón, no el formulario ni el campo
  });

  test('un botón con su propia acción no hereda la del formulario', () => {
    const jsx = analyze('<form data-accion="RF-12.editar"><button type="submit" data-accion="RF-12.crear">Nuevo</button></form>');
    expect(jsx).toContain('"crear"');
    expect(jsx).not.toContain('"editar"');
  });

  test('un botón que no envía no ejecuta la acción del formulario', () => {
    const jsx = analyze('<form data-accion="RF-12.editar"><button type="button">Cancelar</button></form>');
    expect(jsx).not.toContain('handleAction');
  });

  test('un envío marcado «ui» dentro de un formulario enlazado ejecuta la acción (antes quedaba inerte)', () => {
    const jsx = analyze('<form data-accion="RF-12.crear"><input name="nombre"><button type="submit" data-accion="ui">Registrar</button></form>');
    expect(jsx).toContain('handleAction(event, "rf-12", "crear")');
  });

  test('«Cancelar» marcado «ui» sigue siendo solo interfaz aunque sea de envío', () => {
    const jsx = analyze('<form data-accion="RF-12.crear"><button type="submit" data-accion="ui"><span>Cancelar</span></button></form>');
    expect(jsx).not.toContain('handleAction');
  });
});
