const { inflateRawSync } = require('node:zlib');
const { selectDiagramSource, encodePlantUML } = require('../src/infrastructure/services/DocumentationDiagramSource');
const Generator = require('../src/infrastructure/services/ProjectDocumentationGenerator');
const Jobs = require('../src/infrastructure/services/DocumentationJobs');
const types = ['casos_de_uso', 'clases_dominio', 'arquitectura_software', 'arquitectura_sistema', 'clases_diseno', 'arbol_navegacion'];
const placeholder = title => `graph TD\n    A[Inicio: ${title}] --> B[Ejecución de Módulo]\n    B --> C[Fin]`;
const diagrams = () => types.map(tipo => ({ tipo, aprobado: true, version: 1, codigo_plantuml: tipo === 'arbol_navegacion' ? '@startwbs\n* Ventas\n** Productos\n@endwbs' : '@startuml\nactor Cliente\nCliente --> (Consultar productos)\n@enduml', codigo_mermaid: placeholder(tipo) }));

test.each(types)('%s usa la fuente PlantUML aunque exista el Mermaid genérico anterior', tipo => {
  const diagram = diagrams().find(item => item.tipo === tipo);
  expect(selectDiagramSource(diagram)).toEqual({ format: 'plantuml', extension: 'puml', code: diagram.codigo_plantuml });
});

test('las páginas y fuentes descargadas usan el mismo formato real; Mermaid auténtico sigue disponible', () => {
  const bundle = new Generator().generar({ proyecto: { nombre: 'Prueba' }, diagramas: diagrams() });
  const technical = bundle.paginas.find(page => page.id === 'tecnica').markdown;
  expect(technical).not.toContain('Ejecución de Módulo'); expect(technical).not.toContain('```mermaid');
  for (const [index, diagram] of diagrams().entries()) expect(bundle.archivos.find(file => file.ruta === `documentation/docs/assets/diagram-${index + 1}.puml`).contenido).toBe(diagram.codigo_plantuml);
  expect(selectDiagramSource({ codigo_mermaid: 'classDiagram\nclass Venta' }).format).toBe('mermaid');
  expect(selectDiagramSource({ codigo_mermaid: placeholder('Clases') })).toBeNull();
});

test('la codificación comprimida de PlantUML conserva Unicode y evita URLs hexadecimales enormes', () => {
  const code = '@startuml\n' + 'class Venta {\n +registrarDescripción()\n}\n'.repeat(500) + '@enduml';
  const encoded = encodePlantUML(code);
  const standard = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
  const base64 = [...encoded].map(char => standard[alphabet.indexOf(char)]).join('');
  expect(inflateRawSync(Buffer.from(base64, 'base64')).toString('utf8')).toBe(code);
  expect(encoded.length).toBeLessThan(code.length / 2);
});

test('los seis SVG se solicitan a PlantUML y sus evidencias conservan el formato utilizado', async () => {
  const previous = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: true, text: async () => '<svg xmlns="http://www.w3.org/2000/svg"><text>Cliente</text></svg>' }));
  const jobs = new Jobs(); jobs.write = jest.fn();
  const browser = { newContext: jest.fn(() => { throw new Error('No debe convertir PlantUML a Mermaid'); }) };
  const state = { advertencias: [] };
  try {
    await jobs.diagrams('unused', { diagramas: diagrams() }, browser, state);
    expect(browser.newContext).not.toHaveBeenCalled(); expect(global.fetch).toHaveBeenCalledTimes(6);
    expect(global.fetch.mock.calls.every(([url]) => url.includes('/svg/') && !url.includes('/~h'))).toBe(true);
    expect(state.diagramas.every(item => item.formato === 'plantuml' && item.estado === 'renderizado' && item.sha256_fuente)).toBe(true);
  } finally { global.fetch = previous; }
});

test('un diagrama sin fuente real se marca no disponible y no se inventa una infografía', async () => {
  const jobs = new Jobs(); jobs.write = jest.fn(); const state = { advertencias: [] };
  await jobs.diagrams('unused', { diagramas: [{ tipo: 'clases_diseno', codigo_mermaid: placeholder('Clases') }] }, {}, state);
  expect(state.diagramas[0].estado).toBe('no_disponible');
  expect(jobs.write.mock.calls[0][1].contenido).toContain('Diagrama no disponible');
  expect(jobs.write.mock.calls[0][1].contenido).not.toContain('Ejecución de Módulo');
});
