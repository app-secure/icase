const Validator = require('../src/infrastructure/services/ArquitecturaSistemaValidatorService');
const Plant = require('../src/infrastructure/services/PlantUMLValidatorService');
const Generator = require('../src/infrastructure/services/ArquitecturaSistemaGeneratorService');
const Modelos = require('../src/infrastructure/services/ModelosIaService');
const requisitos = [{ tipo: 'RNF', identificador: 'RNF-01', aprobado: true, nombre: 'Respaldos de base de datos', descripcion: 'Guardar una copia cada 24 horas; retener siete copias separadas.' }];
const base = body => `@startuml\n!include <C4/C4_Deployment>\nDeployment_Node(app, "Nodo de aplicación", "Por definir") {\nContainer(api, "Backend", "NestJS", "Operaciones")\nContainerDb(db, "Datos", "PostgreSQL", "Persistencia")\n}\n${body}\n@enduml`;
const copies = 'Deployment_Node(archive, "Destino de copias", "Por definir") {\nContainerDb(store, "Copias de seguridad", "Almacenamiento por definir", "Conserva copias")\n}\n';
const task = 'Container(job, "Tarea de respaldo y restauración", "Por definir", "Ejecuta copia de datos")\n';
const edges = 'Rel(job, db, "Extrae datos", "Canal por definir")\nRel(job, store, "Guarda copias", "Canal por definir")\nRel(store, job, "Entrega copia para restaurar", "Canal por definir")\nRel(job, db, "Restaura datos", "Canal por definir")';

test('la palabra respaldo o Boundary vacío no acreditan el circuito completo', () => {
  const result = new Validator().validar({ codigo: base('Deployment_Node(archive, "Almacenamiento de respaldo", "Separado") {\nBoundary(copias, "Copias de seguridad") {\n}\n}\nRel(db, archive, "Copia cada 24h", "Programado")'), requisitos });
  expect(result.valido).toBe(true);
  const warnings = result.advertencias.join(' ');
  expect(warnings).toContain('proceso o tarea');
  expect(warnings).toContain('artefacto de almacenamiento');
  expect(warnings).toContain('ruta explícita de restauración');
});
test('la tarea, origen, copias y recuperación conectados no requieren otro servidor ni HA', () => {
  const result = new Validator().validar({ codigo: base(copies + task + edges), requisitos });
  expect(result.advertencias).toEqual([]);
  expect(result.alta_disponibilidad_solicitada).toBe(false);
  expect(result.alta_disponibilidad_detectada).toBe(false);
});
test('componentes declarados pero desconectados dejan pendientes explícitos', () => {
  const warnings = new Validator().validar({ codigo: base(copies + task), requisitos }).advertencias.join(' ');
  expect(warnings).toContain('conecta el ejecutor');
  expect(warnings).toContain('ruta explícita de restauración');
});
test('entregar copias al ejecutor no acredita restauración hacia los datos', () => {
  const warnings = new Validator().validar({ codigo: base(copies + task + edges.replace('Rel(job, db, "Restaura datos", "Canal por definir")', '')), requisitos }).advertencias.join(' ');
  expect(warnings).toContain('ruta explícita de restauración');
});
test('sin respaldo solicitado no inventa tareas ni obligaciones', () => {
  expect(new Validator().validar({ codigo: base('') }).advertencias).toEqual([]);
});
test('una SPA en navegadores no sustituye al alojamiento web', () => {
  const browser = 'Deployment_Node(pc, "Tableta", "Navegador") {\nContainer(sala, "Aplicación Web Interna", "React", "Sala")\n}';
  expect(new Validator().validar({ codigo: base(browser) }).advertencias.join(' ')).toContain('artefacto web alojado');
  const hosting = '\nDeployment_Node(host, "Alojamiento Web", "Por definir") {\nContainer(web, "Aplicación Web Interna", "React", "Distribuye recursos")\n}\nRel(web, sala, "Entrega recursos", "HTTPS")';
  expect(new Validator().validar({ codigo: base(browser + hosting) }).advertencias).toEqual([]);
});
test('detecta protocolos en parámetro incorrecto, sin elegir red o puerto', () => {
  const warnings = new Validator().validar({ codigo: base('Rel(api, db, "PostgreSQL / TCP", "Canal por definir")') }).advertencias.join(' ');
  expect(warnings).toContain('tercer argumento');
});
test('las decisiones confirmadas llegan al validador y las propuestas de cloud no se confirman solas', () => {
  const codigo = base('Deployment_Node(host, "Cloud", "Vercel / Railway") {}');
  const review = estado => new Plant().validar(codigo, { tipo: 'arquitectura_sistema',
    analisisRequisitos: { decisiones: [{ estado, necesidad: 'Vercel / Railway' }] } });
  expect(review('pendiente').advertencias.join(' ')).toContain('proveedor Railway');
  expect(review('confirmado').advertencias.join(' ')).not.toContain('proveedor');
});
test('el generador legado ya incluye distribución web y tarea de respaldo con restauración', () => {
  const generated = new Generator().generar({ requerimientos: [...requisitos, { tipo: 'RF', nombre: 'Registrar datos desde aplicación web React con alojamiento web aparte' }] });
  expect(generated.codigo_plantuml).toContain('webDistribution');
  expect(generated.codigo_plantuml).toContain('backupTask');
  expect(generated.codigo_plantuml).toContain('Restaura copia seleccionada');
  expect(generated.codigo_plantuml).toContain('24 horas');
  expect(new Validator().validar({ codigo: generated.codigo_plantuml, requisitos }).advertencias).toEqual([]);
});
test('el circuito también se reconoce en nodos y artefactos PlantUML nativos', () => {
  const codigo = '@startuml\nnode "Nodo" as host {\ndatabase "Datos" as db\ncomponent "Tarea de respaldo" as job\nfolder "Copias de seguridad" as store\n}\njob --> db : Extrae\njob --> store : Guarda copia\nstore --> db : Restaura copia\n@enduml';
  expect(new Validator().validar({ codigo, requisitos }).advertencias).toEqual([]);
});
test('el prompt elimina la contradicción de un único nodo y exige circuitos completos', () => {
  const prompt = new Modelos({ env: {} }).construirPrompt({ objetivo: 'diagramas', tipoDiagrama: 'arquitectura_sistema' });
  expect(prompt).not.toContain('exactamente un nodo');
  expect(prompt).toContain('conserva el mismo nombre de la aplicación aprobada');
  expect(prompt).toContain('circuito completo');
  expect(prompt).toContain('el protocolo aprobado en el cuarto');
});
