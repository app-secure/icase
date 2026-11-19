/**
 * Convierte la salida de una verificación fallida en ubicaciones concretas (archivo, línea y mensaje) para que la
 * persona corrija solo lo que falló, sin regenerar el artefacto completo. Reconoce los formatos de TypeScript,
 * esbuild/Vite, Node (trazas y errores de sintaxis) y Playwright. Lo que no puede ubicar se devuelve aparte.
 */
const MAX_FINDINGS = 30;

// Cada patrón captura (archivo, línea, columna?) y el texto que sigue como mensaje.
const PATTERNS = [
  { categoria: 'compilacion', regex: /([\w./\\@-]+\.(?:tsx?|jsx?|mjs|cjs))\((\d+),(\d+)\):\s*(?:error\s+)?(.*)/ },                     // tsc: src/a.ts(12,5): error TS2322: ...
  { categoria: 'compilacion', regex: /([\w./\\@-]+\.(?:tsx?|jsx?|mjs|cjs)):(\d+):(\d+)\s*[-:]\s*(?:error\s*)?(.*)/i },                    // tsc/esbuild: src/a.ts:12:5 - error ... | a.jsx:12:5: ERROR: ...
  { categoria: 'compilacion', regex: /([\w./\\@-]+\.(?:tsx?|jsx?|mjs|cjs))\s+\((\d+):(\d+)\)[:\s]*(.*)/ },                              // rollup/vite: src/a.jsx (12:5): ...
  { categoria: 'prueba', regex: /([\w./\\@-]*tests?[\w./\\@-]*\.(?:spec|test)\.[cm]?[jt]s):(\d+)(?::(\d+))?\s*(.*)/ },                   // playwright/node:test: tests/e2e/a.spec.js:12:5
  { categoria: 'ejecucion', regex: /at\s+(?:.*?\()?([\w./\\@:-]+\.(?:[cm]?[jt]sx?)):(\d+):(\d+)\)?\s*(.*)/ }                              // traza: at fn (/app/src/a.js:12:5)
];

const STRIP_PREFIX = /^(?:file:\/\/)?(?:\/(?:app|workspace|work|usr\/src\/app|home\/[^/]+\/[^/]+)\/|\.\/|[A-Za-z]:[\\/].*?[\\/](?=(?:backend|frontend|mobile|tests|ops)[\\/]))/;
const normalize = (value) => String(value).replace(/\\/g, '/').replace(STRIP_PREFIX, '').replace(/^\.\//, '');

/** Ruta del artefacto que corresponde a lo que informó la herramienta (por sufijo; gana la coincidencia más específica). */
function resolveFile(reported, files) {
  const wanted = normalize(reported);
  const exact = files.find((file) => file === wanted);
  if (exact) return exact;
  const candidates = files.filter((file) => wanted.endsWith(`/${file}`) || file.endsWith(`/${wanted}`) || file === wanted.replace(/^[^/]+\//, ''));
  return candidates.sort((a, b) => b.length - a.length)[0] || null;
}

/** Qué pantalla o requisito afecta un archivo, cuando la ruta lo dice. */
function ownerOf(ruta) {
  const page = /^(?:frontend|mobile)\/src\/pages\/([^/]+)\.[jt]sx?$/.exec(ruta || '');
  if (page) return { tipo: 'pantalla', id: page[1] };
  const module = /^backend\/src\/modules\/([^/]+)\//.exec(ruta || '');
  if (module) return { tipo: 'requisito', id: module[1].toUpperCase() };
  if (/^backend\/src\/actions\//.test(ruta || '')) return { tipo: 'operaciones', id: 'operaciones de negocio' };
  if (/^tests\//.test(ruta || '')) return { tipo: 'prueba', id: ruta.split('/').pop() };
  return null;
}

class VerificationDiagnosisService {
  /**
   * @param {{errores?: string[], archivos?: Array<{ruta: string}>, ruta_artefacto?: string[]}} entrada
   *   `archivos`: todos los archivos que se ejecutaron; `editables`: rutas que pertenecen al artefacto que se corrige.
   */
  diagnosticar({ errores = [], archivos = [], editables = null } = {}) {
    const files = archivos.map((file) => file.ruta);
    const editable = new Set(editables || files);
    const seen = new Set();
    const ubicados = [];
    const sinUbicacion = [];
    for (const error of errores) {
      let found = false;
      for (const line of String(error).split(/\r?\n/)) {
        for (const { categoria, regex } of PATTERNS) {
          const match = regex.exec(line);
          if (!match) continue;
          const ruta = resolveFile(match[1], files);
          if (!ruta) continue;
          const mensaje = String(match[4] || '').trim() || line.trim();
          const key = `${ruta}:${match[2]}:${mensaje}`;
          found = true;
          if (!seen.has(key)) {
            seen.add(key);
            ubicados.push({ archivo: ruta, linea: Number(match[2]), columna: match[3] ? Number(match[3]) : null, mensaje: mensaje.slice(0, 300), categoria, afecta: ownerOf(ruta), corregible_aqui: editable.has(ruta) });
          }
          break;
        }
      }
      if (!found) sinUbicacion.push(String(error).slice(0, 300));
    }
    return { ubicados: ubicados.slice(0, MAX_FINDINGS), sin_ubicacion: [...new Set(sinUbicacion)].slice(0, 10), total: ubicados.length };
  }
}

module.exports = VerificationDiagnosisService;
