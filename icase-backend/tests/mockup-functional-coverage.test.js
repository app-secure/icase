const Functional = require('../src/infrastructure/services/MockupFunctionalCoverageService');
const Traceability = require('../src/infrastructure/services/MockupTraceabilityService');
const Generate = require('../src/core/use-cases/GenerarMockups');
const service = new Functional();
const requirement = { identificador: 'RF-01', tipo: 'RF', nombre: 'Seleccionar modalidad', descripcion: 'El usuario debe elegir presencial o virtual.', aprobado: true, prioridad: 'Alta' };
const mockup = html => ({ pantalla_id: 'modalidad', nombre_pantalla: 'modalidad', rf_trazabilidad: ['RF-01'], preview_code: html });

describe('cobertura funcional concreta de mockups', () => {
  test('texto descriptivo o un botón ajeno no acredita opciones seleccionables', () => {
    const result = service.validate(requirement, [mockup('<main><h1>Modalidad</h1><p>Presencial o virtual</p><input placeholder="Nombre"><button>Salir</button></main>')]);
    expect(result).toContainEqual(expect.objectContaining({ tipo: 'opciones', presente: false, confianza: 'explicita' }));
  });
  test('acepta select, radios y pestañas con las opciones expresas', () => {
    for (const html of [
      '<main><select><option>Presencial</option><option>Virtual</option></select></main>',
      '<main><fieldset><label><input type="radio" name="m" value="presencial">Presencial</label><label><input type="radio" name="m" value="virtual">Virtual</label></fieldset></main>',
      '<main><div role="tablist"><button role="tab">Presencial</button><button role="tab">Virtual</button></div></main>'
    ]) expect(service.validate(requirement, [mockup(html)]).every(c => c.presente)).toBe(true);
  });
  test('no combina dos pantallas o selectores independientes para inventar una elección', () => {
    expect(service.validate(requirement, [mockup('<select><option>Presencial</option></select>'), mockup('<select><option>Virtual</option></select>')])[0].presente).toBe(false);
    expect(service.validate(requirement, [mockup('<main><select><option>Presencial</option></select><select><option>Virtual</option></select></main>')])[0].presente).toBe(false);
  });
  test('ignora navegación, controles ocultos y campos inventados en metadatos', () => {
    const rf = { nombre: 'Crear ficha', descripcion: 'Campos obligatorios: correo, teléfono.' };
    const screen = { ...mockup('<nav><input placeholder="Correo"></nav><main><div hidden><input placeholder="Teléfono"></div><input type="hidden" name="correo"><p>Correo Teléfono</p></main>'), campos_formulario: [{ nombre: 'Correo' }, { nombre: 'Teléfono' }] };
    expect(service.validate(rf, [screen]).every(c => !c.presente)).toBe(true);
  });
  test('reconoce etiquetas asociadas, hermanas y entidades HTML', () => {
    const rf = { nombre: 'Crear ficha', descripcion: 'Campos: correo y teléfono.' };
    expect(service.validate(rf, [mockup('<main><label for="c">Correo</label><input id="c"><div><label>Tel&#233;fono</label><input></div></main>')]).every(c => c.presente)).toBe(true);
  });
  test('exige una acción visible específica y no un botón cualquiera', () => {
    const rf = { nombre: 'Eliminar ficha', descripcion: 'El usuario debe eliminar su ficha.' };
    expect(service.validate(rf, [mockup('<main><p>Eliminar ficha</p><button>Guardar</button></main>')])[0].presente).toBe(false);
    expect(service.validate(rf, [mockup('<main><button aria-label="Eliminar ficha">×</button></main>')])[0].presente).toBe(true);
    expect(service.expectations({ nombre: 'Proteger ventas', descripcion: 'No se permite eliminar ventas.' })).toEqual([]);
  });
  test('no presupone selección por alternativas inferidas ni convierte estados en inputs', () => {
    expect(service.expectations({ nombre: 'Reserva de mesa o silla' })[0].confianza).toBe('inferida');
    const criteria = service.validate({ nombre: 'Seguimiento', descripcion: 'Estados: pendiente o aprobado.' }, [mockup('<main>Pendiente Aprobado</main>')]);
    expect(criteria).toHaveLength(2);
    expect(criteria.every(c => c.tipo === 'estado' && c.presente)).toBe(true);
  });
  test('bloquea una omisión explícita de un RF alto pero solo advierte una inferencia', () => {
    const trace = new Traceability();
    const html = '<main><h1>Seleccionar modalidad</h1><button>Confirmar</button></main>';
    const result = trace.validate({ manifest: [{ pantalla_id: 'modalidad' }], mockups: [mockup(html)], requirements: [requirement] });
    expect(result.errores.join(' ')).toContain('presencial / virtual');
    const inferred = { ...requirement, nombre: 'Modalidad presencial o virtual', descripcion: '' };
    const reviewed = trace.validate({ manifest: [{ pantalla_id: 'modalidad' }], mockups: [mockup('<main><h1>Modalidad presencial virtual</h1></main>')], requirements: [inferred] });
    expect(reviewed.valido).toBe(true);
    expect(reviewed.advertencias.join(' ')).toContain('presencial / virtual');
  });

  test('comparte criterios con el prompt antes de generar y distingue vínculos de evidencia', () => {
    const context = new Generate({})._construirContexto([requirement], [], { nombre: 'Academia' });
    expect(context).toContain('CRITERIOS CONCRETOS DE INTERFAZ DERIVADOS DE LOS RF');
    expect(context).toContain('[RF-01] opciones: presencial / virtual');
    const result = new Traceability().validate({ manifest: [{ pantalla_id: 'modalidad' }], mockups: [mockup('<main><h1>Seleccionar modalidad</h1><p>Presencial o virtual</p></main>')], requirements: [requirement] });
    expect(result.metricas.criterios_ui_evaluados).toBe(1);
    expect(result.metricas.criterios_ui_con_evidencia).toBe(0);
  });
});
