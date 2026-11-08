const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const ModelosIaService = require('../src/infrastructure/services/ModelosIaService');
const input = 'El administrador gestiona usuarios. El sistema protege contraseñas. No queremos alta disponibilidad.';
const inventory = [
  { id: 'N-01', tipo: 'RF', necesidad: 'Gestionar usuarios', evidencia: 'El administrador gestiona usuarios.', estado: 'confirmado' },
  { id: 'N-02', tipo: 'RNF', necesidad: 'Proteger contraseñas', evidencia: 'El sistema protege contraseñas.', estado: 'pendiente' },
  { id: 'N-03', tipo: 'decision', necesidad: 'Excluir HA', evidencia: 'No queremos alta disponibilidad.', estado: 'rechazado' }
];
const rf = { identificador: 'RF-01', tipo: 'RF', nombre: 'Usuarios', descripcion: 'El sistema DEBE permitir al administrador gestionar usuarios.', necesidades_origen: ['N-01'], evidencia: inventory[0].evidencia };
const rnf = { identificador: 'RNF-01', tipo: 'RNF', nombre: 'Contraseñas', descripcion: 'El sistema DEBE proteger las contraseñas.', necesidades_origen: ['N-02'], evidencia: inventory[1].evidencia, origen: 'explicito', metrica_medible: 'Por confirmar con el usuario', requiere_confirmacion: true };

test('inventario exige evidencia literal y IDs únicos', () => {
  const service = new Coverage();
  expect(() => service.validateInventory([{ ...inventory[0], evidencia: 'Cita inventada' }], input)).toThrow('Inventario inválido');
  expect(() => service.validateInventory([inventory[0], inventory[0]], input)).toThrow('Inventario inválido');
});
test('detecta omisión, agrupación y exclusiones convertidas en requisitos', () => {
  const problems = new Coverage().problems({ requerimientos: [{ ...rf, necesidades_origen: ['N-01', 'N-03'] }] }, inventory, input);
  expect(problems.join(' ')).toMatch(/Falta N-02/);
  expect(problems.join(' ')).toMatch(/excluida/);
});
test('dos llamadas sin reparación conservan decisiones fuera de los requisitos', async () => {
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: inventory }).mockResolvedValueOnce({ requerimientos: [rf, rnf] });
  const result = await new Coverage().generate({ input, prompt: 'Analiza', request });
  expect(request).toHaveBeenCalledTimes(2);
  expect(result.requerimientos).toHaveLength(2);
  expect(result.auditoria_requisitos.decisiones).toEqual([inventory[2]]);
});
test('repara solo omisiones y protege requisitos correctos de cambios o borrados', async () => {
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: inventory })
    .mockResolvedValueOnce({ requerimientos: [rf] })
    .mockResolvedValueOnce({ eliminar_identificadores: ['RF-01'], requerimientos_corregidos: [{ ...rf, nombre: 'Cambio indebido' }, rnf] });
  const result = await new Coverage().generate({ input, prompt: 'Analiza', request });
  expect(request).toHaveBeenCalledTimes(3);
  expect(result.requerimientos[0]).toEqual(rf);
  expect(result.auditoria_requisitos.reparaciones).toBe(1);
});
test('divide una agrupación sin perder ninguna necesidad', async () => {
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: inventory })
    .mockResolvedValueOnce({ requerimientos: [{ ...rf, necesidades_origen: ['N-01', 'N-02'] }] })
    .mockResolvedValueOnce({ eliminar_identificadores: ['RF-01'], requerimientos_corregidos: [rf, rnf] });
  const result = await new Coverage().generate({ input, prompt: 'Analiza', request });
  expect(result.requerimientos).toEqual([rf, rnf]);
});
test('una cobertura incompleta devuelve borrador advertido en vez de bloquear el proyecto', async () => {
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: inventory })
    .mockResolvedValueOnce({ requerimientos: [rf] }).mockResolvedValueOnce(null);
  const result = await new Coverage().generate({ input, prompt: 'Analiza', request });
  expect(result.auditoria_requisitos.estado).toBe('revision_requerida');
  expect(result.auditoria_requisitos.advertencias.join(' ')).toContain('Falta N-02');
  expect(result.requerimientos[0]).toEqual(rf); // una omisión global no cambia la decisión de otro requisito
  expect(request).toHaveBeenCalledTimes(3);
});

test('normaliza mayúsculas, espacios, Unicode y estados sin cambiar el significado', () => {
  const result = new Coverage().validateInventory([{ ...inventory[0], tipo: ' rf ', estado: ' Confirmado ', evidencia: 'el administrador   gestiona usuarios.' }], input);
  expect(result[0]).toMatchObject({ tipo: 'RF', estado: 'confirmado' });
});

test('un proyecto nuevo puede generar aunque falle la lista interna; no afirma cobertura válida', async () => {
  const service = new ModelosIaService();
  service.generarConGemini = jest.fn().mockResolvedValueOnce({ inventario_necesidades: [{ ...inventory[0], evidencia: 'Cita inventada' }] })
    .mockResolvedValueOnce({ correcciones: [] })
    .mockResolvedValueOnce({ requerimientos: [rf, rnf] });
  const result = await service.procesar({ objetivo: 'requisitos', provider: 'gemini', insumo_bruto: input });
  expect(result.requerimientos).toHaveLength(2);
  expect(result.requerimientos[0].requiere_confirmacion).toBe(false);
  expect(result.requerimientos[1].requiere_confirmacion).toBe(true); // métrica realmente pendiente
  expect(result.auditoria_requisitos.estado).toBe('revision_requerida');
  expect(service.generarConGemini.mock.calls[2][0]).toContain('insumo original');
});

test('acepta comillas envolventes sin aceptar paráfrasis o elipsis como citas literales', () => {
  const service = new Coverage();
  for (const evidence of ['"El administrador gestiona usuarios."', '“El administrador gestiona usuarios.”', '«El administrador gestiona usuarios.»']) {
    expect(service.validateInventory([{ ...inventory[0], evidencia: evidence }], input)[0].evidencia).toBe(inventory[0].evidencia);
  }
  expect(service.inspectInventory([{ ...inventory[0], evidencia: 'El administrador ... usuarios.' }], input).invalid[0].errores).toEqual(['evidencia_no_localizada']);
});

test('informa causas específicas y conserva los elementos correctos', () => {
  const report = new Coverage().inspectInventory([inventory[0], { ...inventory[0], tipo: 'RF|RNF', estado: 'otro' }, { ...inventory[1], evidencia: 'inventada' }], input);
  expect(report.valid).toEqual([inventory[0]]);
  expect(report.invalid[0].errores).toEqual(['identificador_duplicado', 'tipo_invalido', 'estado_invalido']);
  expect(report.invalid[1].errores).toEqual(['evidencia_no_localizada']);
});

test('repara únicamente N-28 y sigue generando por lotes sin perder N-01 a N-27', async () => {
  const items = Array.from({ length: 28 }, (_, i) => ({ ...inventory[0], id: `N-${i + 1}` }));
  const corrupted = items.map((item, index) => index === 27 ? { ...item, evidencia: 'cita inventada' } : item);
  let batch = 0;
  const request = jest.fn(async (prompt) => {
    if (request.mock.calls.length === 1) return { inventario_necesidades: corrupted };
    if (prompt.startsWith('REPARACIÓN PARCIAL DEL INVENTARIO')) {
      expect(prompt).toContain('evidencia_no_localizada');
      return { correcciones: [
        { indice: 1, elemento: { ...items[0], necesidad: 'Cambio indebido' } },
        { indice: 28, elemento: items[27] }
      ] };
    }
    const current = items.slice(batch++ * 5, batch * 5);
    expect(prompt).toContain('LOTE');
    return { requerimientos: current.map((item) => ({ ...rf, identificador: `RF-${item.id}`, necesidades_origen: [item.id] })) };
  });
  const result = await new Coverage().generate({ input, prompt: `Analiza ${input}`, request });
  expect(result.requerimientos).toHaveLength(28);
  expect(result.auditoria_requisitos.inventario).toEqual(items);
  expect(result.auditoria_requisitos.estado).toBe('cobertura_verificada');
  expect(result.auditoria_requisitos.diagnostico_inventario.errores_iniciales[0].id).toBe('N-28');
  expect(result.auditoria_requisitos.diagnostico_inventario.errores_pendientes).toEqual([]);
  expect(request).toHaveBeenCalledTimes(8);
});

test('si no se repara una necesidad, persiste su diagnóstico y conserva el lote válido', async () => {
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: [inventory[0], { ...inventory[1], evidencia: 'inventada' }] })
    .mockResolvedValueOnce({ correcciones: [] }).mockResolvedValueOnce({ requerimientos: [rf] });
  const result = await new Coverage().generate({ input, prompt: 'Analiza', request });
  expect(result.auditoria_requisitos.inventario).toEqual([inventory[0]]);
  expect(result.auditoria_requisitos.estado).toBe('revision_requerida');
  expect(result.auditoria_requisitos.advertencias.join(' ')).toContain('no se encontró como fragmento continuo');
  expect(result.auditoria_requisitos.diagnostico_inventario.errores_pendientes[0].errores).toContain('evidencia_no_localizada');
  expect(result.auditoria_requisitos.diagnostico_inventario.errores_pendientes[0].elemento.necesidad).toBe('Proteger contraseñas');
});

test('un fallo del proveedor durante la reparación no elimina necesidades válidas', async () => {
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: [inventory[0], { ...inventory[1], tipo: 'incorrecto' }] })
    .mockRejectedValueOnce(new Error('Proveedor temporalmente indisponible')).mockResolvedValueOnce({ requerimientos: [rf] });
  const result = await new Coverage().generate({ input, prompt: 'Analiza', request });
  expect(result.requerimientos).toHaveLength(1);
  expect(result.auditoria_requisitos.diagnostico_inventario.errores_pendientes).toHaveLength(1);
});

test('una reparación de ID duplicado no sobrescribe al elemento válido', async () => {
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: [inventory[0], { ...inventory[1], id: 'N-01' }] })
    .mockResolvedValueOnce({ correcciones: [{ indice: 2, elemento: inventory[1] }] })
    .mockResolvedValueOnce({ requerimientos: [rf, rnf] });
  const result = await new Coverage().generate({ input, prompt: 'Analiza', request });
  expect(result.auditoria_requisitos.inventario).toEqual(inventory.slice(0, 2));
  expect(result.auditoria_requisitos.estado).toBe('cobertura_verificada');
});

test('la normalización final conserva la evidencia citada y su origen explícito', () => {
  const result = new ModelosIaService().normalizarResultado({ requerimientos: [{ ...rf, origen: 'explicito', evidencia: `“${rf.evidencia}”` }] }, 'requisitos', null, { insumo: input });
  expect(result.requerimientos[0]).toMatchObject({ evidencia: rf.evidencia, origen: 'explicito' });
});

test('no entrega una generación vacía como si fuese un borrador válido', async () => {
  const request = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ requerimientos: [] });
  await expect(new Coverage().generate({ input, prompt: 'Analiza', request })).rejects.toMatchObject({ code: 'AI_REQUIREMENTS_UNAVAILABLE' });
  expect(request).toHaveBeenCalledTimes(1);
});

test('genera proyectos grandes en lotes conservando el contexto completo sin duplicar IDs', async () => {
  const largeInventory = Array.from({ length: 12 }, (_, i) => ({ ...inventory[0], id: `N-${i + 1}`, necesidad: `Objetivo ${i + 1}` }));
  let call = 0;
  const request = jest.fn(async (prompt) => {
    if (call++ === 0) return { inventario_necesidades: largeInventory };
    const batch = largeInventory.slice((call - 2) * 5, (call - 1) * 5);
    expect(prompt).toContain(input);
    expect(prompt).toContain('genera SOLO');
    return { nombre_proyecto: 'Proyecto genérico', requerimientos: batch.map((item) => ({ ...rf, identificador: `RF-${item.id}`, necesidades_origen: [item.id] })) };
  });
  const result = await new Coverage().generate({ input, prompt: `Analiza ${input}`, request });
  expect(request).toHaveBeenCalledTimes(4);
  expect(result.requerimientos).toHaveLength(12);
  expect(result.auditoria_requisitos.estado).toBe('cobertura_verificada');
});

test('no intenta reparar una respuesta vacía con un prompt todavía más grande', async () => {
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: inventory }).mockResolvedValueOnce(null);
  await expect(new Coverage().generate({ input, prompt: 'Analiza', request })).rejects.toThrow('JSON válido');
  expect(request).toHaveBeenCalledTimes(2);
});

test('conserva lotes válidos como borrador advertido si otro lote falla', async () => {
  const largeInventory = Array.from({ length: 6 }, (_, i) => ({ ...inventory[0], id: `N-${i + 1}` }));
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: largeInventory })
    .mockResolvedValueOnce({ requerimientos: largeInventory.slice(0, 5).map((item) => ({ ...rf, identificador: item.id, necesidades_origen: [item.id] })) })
    .mockResolvedValueOnce(null);
  const result = await new Coverage().generate({ input, prompt: 'Analiza', request });
  expect(result.requerimientos).toHaveLength(5);
  expect(result.auditoria_requisitos.estado).toBe('revision_requerida');
  expect(result.auditoria_requisitos.advertencias.join(' ')).toContain('Falta N-6');
  expect(request).toHaveBeenCalledTimes(3);
});
test('integra el flujo en el proveedor seleccionado sin llamadas externas y mantiene origen explícito sin cifra', async () => {
  const service = new ModelosIaService();
  service.generarConGemini = jest.fn().mockResolvedValueOnce({ inventario_necesidades: inventory })
    .mockResolvedValueOnce({ requerimientos: [rf, rnf] }).mockResolvedValueOnce({ hallazgos: [] });
  const result = await service.procesar({ objetivo: 'requisitos', provider: 'gemini', insumo_bruto: input });
  expect(service.generarConGemini).toHaveBeenCalledTimes(3);
  expect(result.auditoria_requisitos.inventario).toEqual(inventory);
  expect(result.requerimientos[1]).toMatchObject({ origen: 'explicito', requiere_confirmacion: true });
});
