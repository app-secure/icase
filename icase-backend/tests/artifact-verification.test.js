const ArtifactVerificationService = require('../src/core/services/ArtifactVerificationService');
const GestionarArtefactosCodigo = require('../src/core/use-cases/GestionarArtefactosCodigo');

const verifier = new ArtifactVerificationService();
const file = (ruta, contenido) => ({ ruta, contenido });

describe('verificación de artefactos generados', () => {
  test('detecta módulos NestJS vacíos y falta de persistencia antes de aprobar', () => {
    const result = verifier.verificar({ tipo: 'codigo_backend', archivos: [
      file('backend/package.json', JSON.stringify({ dependencies: { '@nestjs/core': '^10' } })),
      file('backend/icase.manifest.json', '{}'),
      file('backend/src/modules/reservas/reservas.module.ts', '@Module({}) export class ReservasModule {}'),
      file('backend/src/health.controller.ts', '@Controller("health") class Health {}'),
      file('backend/src/main.ts', '/* PostgreSQL */')
    ] });
    expect(result.estado).toBe('fallida');
    expect(result.errores.join(' ')).toMatch(/módulos NestJS vacíos/);
    expect(result.errores.join(' ')).toMatch(/PostgreSQL/);
  });

  test('detecta pantallas de mockup sin conexión API', () => {
    const result = verifier.verificar({ tipo: 'codigo_frontend', archivos: [
      file('frontend/package.json', '{}'), file('frontend/src/App.jsx', 'export default function App() {}'),
      file('frontend/src/pages/reservas.jsx', 'return <main dangerouslySetInnerHTML={{__html: markup}} />')
    ] });
    expect(result.estado).toBe('fallida');
    expect(result.errores.join(' ')).toMatch(/mockups/);
    expect(result.errores.join(' ')).toMatch(/API/);
  });

  test('bloquea una falsa alta disponibilidad con puerto fijo en dos réplicas', () => {
    const result = verifier.verificar({ tipo: 'infraestructura', archivos: [
      file('ops/docker-compose.yml', 'services:\n  backend:\n    ports:\n      - "${API_PORT:-3000}:3000"'),
      file('ops/docker-compose.ha.yml', 'services:\n  backend:\n    deploy:\n      replicas: 2'),
      file('ops/docker/backend.Dockerfile', 'FROM node:22'),
      file('ops/docker/frontend.Dockerfile', 'FROM nginx:1.27')
    ] });
    expect(result.estado).toBe('fallida');
    expect(result.errores.join(' ')).toMatch(/puerto fijo/);
  });

  test('rechaza la aprobación del backend incompleto', async () => {
    const artifact = { id: 'a1', proyecto_id: 'p1', tipo: 'codigo_backend', estado: 'en_revision',
      archivos: [file('backend/package.json', '{}'), file('backend/icase.manifest.json', '{}')] };
    const useCase = new GestionarArtefactosCodigo({
      planCodificacionRepository: { obtenerPorProyecto: jest.fn().mockResolvedValue({}) },
      artefactoRepository: {
        obtenerPorId: jest.fn().mockResolvedValue(artifact),
        obtenerUltimo: jest.fn().mockResolvedValue(artifact), actualizar: jest.fn()
      }
    });
    await expect(useCase.revisarBackend({ proyectoId: 'p1', artefactoId: 'a1', decision: 'aprobar' }))
      .rejects.toThrow('artefacto incompleto');
  });

  test('editar un archivo invalida la verificación anterior y actualiza su huella', async () => {
    const artifact = { id: 'a1', proyecto_id: 'p1', tipo: 'codigo_backend', estado: 'en_revision',
      archivos: [file('backend/src/main.ts', 'anterior')], verificacion: { estado: 'apta_estructuralmente' } };
    const update = jest.fn().mockImplementation(async (_id, changes) => ({ ...artifact, ...changes }));
    const useCase = new GestionarArtefactosCodigo({ artefactoRepository: {
      obtenerPorId: jest.fn().mockResolvedValue(artifact), obtenerUltimo: jest.fn().mockResolvedValue(artifact), actualizar: update
    } });
    const result = await useCase.actualizarArchivo({ proyectoId: 'p1', artefactoId: 'a1', ruta: 'backend/src/main.ts', contenido: 'nuevo' });
    expect(result.verificacion).toBeNull();
    expect(result.archivos[0].contenido).toBe('nuevo');
    expect(result.archivos[0].huella).toMatch(/^[a-f0-9]{64}$/);
    await expect(useCase.actualizarArchivo({ proyectoId: 'p1', artefactoId: 'a1', ruta: 'otro', contenido: 'x' }))
      .rejects.toThrow('no pertenece');
  });

  test('la aprobación exige evidencia de ejecución aislada para la versión exacta', () => {
    const useCase = new GestionarArtefactosCodigo({});
    useCase.verifier.verificar = jest.fn().mockReturnValue({ estado: 'apta_estructuralmente', huella: 'huella-actual', errores: [] });
    const artifact = { tipo: 'codigo_backend', verificacion: null };
    expect(() => useCase._exigirVerificacion(artifact)).toThrow('Verifica esta versión');
    artifact.verificacion = { huella: 'huella-anterior', estado: 'apta', nivel: 'ejecucion_aislada' };
    expect(() => useCase._exigirVerificacion(artifact)).toThrow('Verifica esta versión');
    artifact.verificacion = { huella: 'huella-actual', estado: 'apta_estructuralmente', nivel: 'estatico' };
    expect(() => useCase._exigirVerificacion(artifact)).toThrow('no fue satisfactoria');
    artifact.verificacion = { huella: 'huella-actual', estado: 'apta', nivel: 'ejecucion_aislada', pruebas: [{ paso: 'Integración', resultado: 'correcto' }] };
    expect(useCase._exigirVerificacion(artifact)).toBe(artifact.verificacion);
  });
});
