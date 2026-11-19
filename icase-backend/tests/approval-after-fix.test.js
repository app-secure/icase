const crypto = require('node:crypto');
const GestionarArtefactosCodigo = require('../src/core/use-cases/GestionarArtefactosCodigo');
const { CODE_PHASE_STATES } = require('../src/core/constants/CodeGenerationPhases');

const huella = (texto) => crypto.createHash('sha256').update(texto).digest('hex');
const archivo = (ruta, contenido) => ({ ruta, contenido, huella: huella(contenido) });

const montar = ({ estado = 'aprobado', verificacionFinal } = {}) => {
  let artefacto = { id: 'a1', proyecto_id: 'p1', tipo: 'codigo_backend', version: 1, estado, aprobado: estado === 'aprobado', archivos: [archivo('backend/src/a.js', 'uno'), archivo('backend/src/b.js', 'dos')], verificacion: { estado: 'apta' } };
  let plan = { proyecto_id: 'p1', etapas: [{ etapa: 'generacion_backend', estado: CODE_PHASE_STATES.APPROVED }, { etapa: 'generacion_pruebas', estado: CODE_PHASE_STATES.APPROVED }] };
  const artefactoRepository = {
    obtenerPorId: jest.fn(async () => artefacto),
    obtenerUltimo: jest.fn(async () => artefacto),
    actualizar: jest.fn(async (_id, cambios) => { artefacto = { ...artefacto, ...cambios }; return artefacto; })
  };
  const planRepository = {
    obtenerPorProyecto: jest.fn(async () => plan),
    guardar: jest.fn(async (_id, cambios) => { plan = { ...plan, ...cambios }; return plan; })
  };
  const useCase = new GestionarArtefactosCodigo({ proyectoRepository: {}, planCodificacionRepository: planRepository, artefactoRepository });
  useCase.verifier = { verificar: () => ({ estado: 'apta_estructuralmente', huella: 'h', errores: [] }) };
  useCase.runtimeVerifier = { verificar: jest.fn(async () => verificacionFinal || { estado: 'apta', nivel: 'ejecucion_aislada', pruebas: [], errores: [] }) };
  return { useCase, artefacto: () => artefacto, plan: () => plan };
};

describe('corrección puntual de un artefacto aprobado', () => {
  test('se puede corregir un archivo; queda registrado, aprobado y pendiente de verificar', async () => {
    const { useCase, artefacto } = montar();
    await useCase.actualizarArchivo({ proyectoId: 'p1', artefactoId: 'a1', ruta: 'backend/src/a.js', contenido: 'uno corregido' });
    const actual = artefacto();
    expect(actual).toMatchObject({ estado: 'aprobado', aprobado: true, pendiente_reverificacion: true, verificacion: null });
    expect(actual.correcciones).toEqual([expect.objectContaining({ ruta: 'backend/src/a.js', huella_anterior: huella('uno'), huella_nueva: huella('uno corregido') })]);
    expect(actual.archivos.find((file) => file.ruta === 'backend/src/b.js').contenido).toBe('dos'); // solo cambia ese archivo
  });

  test('guardar el mismo contenido no pierde la verificación', async () => {
    const { useCase, artefacto } = montar();
    await useCase.actualizarArchivo({ proyectoId: 'p1', artefactoId: 'a1', ruta: 'backend/src/a.js', contenido: 'uno' });
    expect(artefacto().verificacion).toEqual({ estado: 'apta' });
    expect(artefacto().pendiente_reverificacion).toBeUndefined();
  });

  test('si la nueva verificación pasa, la aprobación se mantiene y los pasos siguientes siguen aprobados', async () => {
    const { useCase, artefacto, plan } = montar();
    await useCase.actualizarArchivo({ proyectoId: 'p1', artefactoId: 'a1', ruta: 'backend/src/a.js', contenido: 'corregido' });
    const resultado = await useCase.verificarArtefacto('p1', 'a1');
    expect(resultado.aprobacion_mantenida).toBe(true);
    expect(artefacto()).toMatchObject({ estado: 'aprobado', aprobado: true, pendiente_reverificacion: false });
    expect(plan().etapas.every((item) => item.estado === CODE_PHASE_STATES.APPROVED)).toBe(true);
  });

  test('si la corrección no pasa, se retira la aprobación y el paso vuelve a revisión', async () => {
    const { useCase, artefacto, plan } = montar({ verificacionFinal: { estado: 'fallida', nivel: 'ejecucion_aislada', pruebas: [], errores: ['src/a.js(1,1): error TS1: x'] } });
    await useCase.actualizarArchivo({ proyectoId: 'p1', artefactoId: 'a1', ruta: 'backend/src/a.js', contenido: 'roto' });
    const resultado = await useCase.verificarArtefacto('p1', 'a1');
    expect(resultado.aprobacion_retirada).toBe(true);
    expect(resultado.diagnostico.ubicados[0]).toMatchObject({ archivo: 'backend/src/a.js', linea: 1 });
    expect(artefacto()).toMatchObject({ estado: 'en_revision', aprobado: false, pendiente_reverificacion: false });
    expect(plan().etapas.find((item) => item.etapa === 'generacion_backend').estado).toBe(CODE_PHASE_STATES.IN_REVIEW);
    expect(plan().etapas.find((item) => item.etapa === 'generacion_pruebas').estado).toBe(CODE_PHASE_STATES.STALE);
  });

  test('una verificación normal de un artefacto sin correcciones no cambia su estado', async () => {
    const { useCase, artefacto } = montar({ estado: 'en_revision' });
    const resultado = await useCase.verificarArtefacto('p1', 'a1');
    expect(resultado.aprobacion_mantenida).toBeUndefined();
    expect(artefacto().estado).toBe('en_revision');
  });

  test('un artefacto rechazado o desactualizado no se edita', async () => {
    const { useCase } = montar({ estado: 'desactualizado' });
    await expect(useCase.actualizarArchivo({ proyectoId: 'p1', artefactoId: 'a1', ruta: 'backend/src/a.js', contenido: 'x' })).rejects.toThrow(/en revisión o aprobado/);
  });
});
