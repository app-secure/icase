/**
 * Puerta de calidad funcional previa a la entrega.
 *
 * Revisa lo que se va a entregar (no lo que los generadores dicen haber hecho) y bloquea el paquete si hay requisitos
 * que solo tienen CRUD genérico, requisitos "solo datos", botones sin operación u operaciones sin prueba.
 * Cada bloqueo puede aceptarse de forma explícita por su identificador; los avisos nunca bloquean.
 */

const FILES = Object.freeze({
  backendManifest: 'backend/icase.manifest.json',
  report: 'backend/GENERATION-REPORT.json',
  frontendManifest: 'frontend/icase.manifest.json',
  mobileManifest: 'mobile/icase.manifest.json'
});

const parse = (archivos, ruta) => {
  const text = archivos.find((item) => item.ruta === ruta)?.contenido;
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
};

const finding = ({ severidad = 'bloqueo', codigo, objetivo, mensaje, donde }) => ({
  id: `${codigo}:${objetivo}`, severidad, codigo, objetivo, mensaje, donde
});

class FunctionalGateService {
  /**
   * @param {{archivos: Array<{ruta: string, contenido: string}>, excepciones?: string[]}} entrada archivos de la entrega
   * @returns {{version: number, estado: 'aprobada'|'bloqueada', hallazgos: object[], pendientes: object[], excepciones: string[]}}
   */
  evaluar({ archivos = [], excepciones = [] } = {}) {
    const accepted = new Set((Array.isArray(excepciones) ? excepciones : []).map(String));
    const backend = parse(archivos, FILES.backendManifest);
    const report = parse(archivos, FILES.report);
    const frontend = parse(archivos, FILES.frontendManifest);
    const tests = archivos.filter((item) => /^tests\//.test(item.ruta)).map((item) => item.contenido).join('\n');
    const findings = [];

    if (!backend) {
      findings.push(finding({ codigo: 'sin_backend', objetivo: 'backend', mensaje: 'La entrega no trae el manifiesto del backend; no puede comprobarse qué hace cada requisito.', donde: 'Generación del backend' }));
    } else {
      const operations = (backend.operations || []).filter((operation) => !operation.support && !operation.identity);
      if (!backend.spec) {
        findings.push(finding({ codigo: 'espec_omitida', objetivo: 'aplicacion', mensaje: 'No se aprobó el comportamiento de la aplicación: todos los requisitos usan un CRUD genérico de su entidad.', donde: 'Planificación › Comportamiento de la aplicación' }));
      } else {
        for (const operation of operations.filter((item) => !item.actions?.length)) {
          findings.push(finding({ codigo: 'sin_operacion', objetivo: operation.id, mensaje: `${operation.id} «${operation.name}» no tiene ninguna operación confirmada: solo ofrece CRUD genérico.`, donde: 'Planificación › Comportamiento de la aplicación' }));
        }
      }
      // Cada operación de negocio debe tener una prueba que la nombre; sin pruebas generadas el aviso se da una sola vez.
      const actions = operations.flatMap((operation) => (operation.actions || []).map((action) => ({ ...action, requisito: operation.id })));
      for (const action of actions.filter((item) => !tests.includes(item.name))) {
        findings.push(finding({ codigo: 'operacion_sin_prueba', objetivo: action.name, mensaje: `La operación «${action.name}» (${action.requisito}) no tiene prueba.`, donde: 'Generación de pruebas' }));
      }
      // Las pantallas del cliente están en la app móvil: sus operaciones también tienen pantalla.
      const mobile = parse(archivos, FILES.mobileManifest);
      const used = new Set([...(frontend?.pantallas || []), ...(mobile?.pantallas || [])].flatMap((screen) => screen.especificacion?.operaciones || []));
      if (frontend && backend.spec) {
        for (const action of actions.filter((item) => !used.has(item.name))) {
          findings.push(finding({ severidad: 'aviso', codigo: 'operacion_sin_pantalla', objetivo: action.name, mensaje: `Ninguna pantalla usa la operación «${action.name}».`, donde: 'Planificación › Comportamiento de la aplicación' }));
        }
      }
    }

    for (const item of (report?.requisitos || []).filter((entry) => ['solo_datos', 'no_soportado'].includes(entry.nivel))) {
      findings.push(finding({ codigo: item.nivel, objetivo: item.id, mensaje: `${item.id} «${item.nombre}»: ${item.nivel === 'solo_datos' ? 'solo guarda y consulta datos' : 'no se genera'}. ${(item.motivos || []).slice(-1)[0] || ''}`.trim(), donde: 'Informe de generación del backend' }));
    }

    for (const screen of frontend?.pantallas || []) {
      const dead = screen.enlaces?.sin_enlace_total || 0;
      if (dead > 0 && screen.origen !== 'especificacion') {
        findings.push(finding({ codigo: 'botones_sin_operacion', objetivo: screen.id, mensaje: `La pantalla «${screen.name}» tiene ${dead} control(es) sin operación: ${(screen.enlaces.sin_enlace || []).slice(0, 5).join(', ')}.`, donde: `Pantalla ${screen.id}` }));
      }
    }

    const hallazgos = findings.map((item) => ({ ...item, aceptado: item.severidad === 'bloqueo' && accepted.has(item.id) }));
    const pendientes = hallazgos.filter((item) => item.severidad === 'bloqueo' && !item.aceptado);
    return {
      version: 1, estado: pendientes.length ? 'bloqueada' : 'aprobada',
      hallazgos, pendientes,
      // Solo se conservan las aceptaciones que corresponden a un hallazgo actual: una aceptación vieja no cubre un problema nuevo.
      excepciones: hallazgos.filter((item) => item.aceptado).map((item) => item.id)
    };
  }

  exigir(entrada) {
    const resultado = this.evaluar(entrada);
    if (resultado.estado === 'bloqueada') {
      const lista = resultado.pendientes.slice(0, 12).map((item) => `[${item.id}] ${item.mensaje} Corrígelo en: ${item.donde}.`).join(' ');
      const extra = resultado.pendientes.length > 12 ? ` (y ${resultado.pendientes.length - 12} más)` : '';
      throw Object.assign(new Error(`La puerta de calidad funcional bloquea la entrega: ${lista}${extra} Corrige los problemas o acepta explícitamente los que no vayan a corregirse.`), { puerta: resultado });
    }
    return resultado;
  }
}

module.exports = FunctionalGateService;
