const Coverage = require('../src/infrastructure/services/RequirementCoverageService');

const need = (id, text = 'Consultar registros') => ({ id, tipo: 'RF', objetivo_id: `O-${id}`, necesidad: text,
  estado: 'confirmado', evidencia: text });
const req = { identificador: 'RF-01', tipo: 'RF', nombre: 'Consultar', descripcion: 'Consultar registros',
  evidencia: 'Consultar registros', necesidades_origen: ['N-01'],
  criterios_aceptacion: [{ descripcion: 'Se muestran registros', necesidades_origen: ['N-01'] }] };
const audit = () => ({ version: 2, inventario: [need('N-01')], necesidades_pendientes: [] });

test('sin respuesta no fabrica requisitos para necesidades omitidas ni trunca textos', async () => {
  const state = audit();
  state.inventario.push(need('N-02', 'Restaurar '.repeat(20)));
  const result = await new Coverage().refine({ input: 'Consultar registros ' + 'Restaurar '.repeat(20),
    instruction: 'Corrige problemas', existingRequirements: [req], existingAudit: state, request: async () => null });
  expect(result.requerimientos).toHaveLength(1);
  expect(result.auditoria_requisitos.control_aprobacion.bloqueado).toBe(true);
  expect(result.auditoria_requisitos.estado).toBe('revision_requerida');
});

test('no descarta evidencia inválida ni cierra hallazgos críticos sin resolverlos', async () => {
  const state = audit();
  state.necesidades_pendientes = [{ id: 'N-02', estado_validacion: 'pendiente', elemento: need('N-02', 'Cita inexistente') }];
  state.revision_semantica = { hallazgos: [{ id: 'H-01', estado: 'confirmado', severidad: 'critico', descripcion: 'Falta operación' }] };
  const result = await new Coverage().refine({ input: 'Consultar registros', instruction: 'Corrige',
    existingRequirements: [req], existingAudit: state, request: async () => null });
  expect(result.auditoria_requisitos.necesidades_pendientes[0].estado_validacion).toBe('pendiente');
  expect(result.auditoria_requisitos.revision_semantica.hallazgos[0].estado).toBe('confirmado');
});

test('reconoce RF explícito y rechaza corrección que pierde evidencia válida', async () => {
  const request = jest.fn(async () => ({ requerimientos_corregidos: [{ ...req, evidencia: 'Inventada', nombre: 'Cambio' }] }));
  const result = await new Coverage().refine({ input: 'Consultar registros', instruction: 'Corrige RF-01',
    existingRequirements: [req], existingAudit: audit(), request });
  expect(request.mock.calls[0][0]).toContain('Requisitos habilitados');
  expect(result.requerimientos[0].nombre).toBe('Consultar');
  expect(result.auditoria_requisitos.diagnostico_refinamiento.parche_rechazado).toBe(true);
});

test('protege requisitos no seleccionados aunque el proveedor intente alterarlos', async () => {
  const result = await new Coverage().refine({ input: 'Consultar registros', instruction: 'Corrige RNF-99',
    existingRequirements: [req], existingAudit: audit(),
    request: async () => ({ requerimientos_corregidos: [{ ...req, nombre: 'Alterado' }] }) });
  expect(result.requerimientos[0].nombre).toBe('Consultar');
});

test('acepta una corrección sustentada sin inventar cambios secundarios', async () => {
  const result = await new Coverage().refine({ input: 'Consultar registros', instruction: 'Corrige RF-01',
    existingRequirements: [req], existingAudit: audit(),
    request: async () => ({ requerimientos_corregidos: [{ ...req, nombre: 'Consulta de registros' }] }) });
  expect(result.requerimientos[0].nombre).toBe('Consulta de registros');
  expect(result.auditoria_requisitos.diagnostico_refinamiento.parche_rechazado).toBe(false);
  expect(result.auditoria_requisitos.control_aprobacion.bloqueado).toBe(false);
});

test('diagnostica lotes parcialmente respondidos sin afirmar cobertura completa', async () => {
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: [need('N-01'), need('N-02', 'Exportar registros')] })
    .mockResolvedValueOnce({ requerimientos: [req] }).mockResolvedValueOnce(null);
  const result = await new Coverage().generate({ input: 'Consultar registros. Exportar registros', prompt: 'Genera', request });
  const batches = result.auditoria_requisitos.diagnostico_generacion.lotes;
  expect(batches[0].estado).toBe('parcial');
  expect(batches[0].necesidades_sin_referencia).toContain('N-02');
  expect(result.auditoria_requisitos.estado).toBe('revision_requerida');
});
