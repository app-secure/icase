/**
 * SLA & Thresholds Configuration for I-CASE Performance Tests
 * Standards & Non-Functional Requirements:
 * - RNF-01: SLA de Rendimiento (p95 <= 3000ms con 50 VUs concurrentes, errores 5xx < 1%)
 * - RNF-02: Exportación eficiente por tamaño de proyecto
 * - RNF-06: Generación controlada de IA con observabilidad de tokens y degradación elegante
 */

// Base URL configurable vía variable de entorno o fallback a docker/local
export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000/api').replace(/\/+$/, '');

/**
 * Normaliza la ruta relativa contra BASE_URL asegurando que no se dupliquen o pierdan prefijos
 * Si el servidor corre sin prefijo /api, se puede pasar __ENV.BASE_URL='http://localhost:5000'
 */
export function resolveEndpoint(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}${cleanPath}`;
}

/**
 * Headers estándar con autenticación Bearer y formato JSON
 */
export function authHeaders(token) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Umbrales estándar para RNF-01 (Concurrencia y latencia)
 * - p(95) <= 3000 ms
 * - p(50) < 800 ms (mediana ágil)
 * - Tasa de errores HTTP < 1% (rate < 0.01)
 */
export const STANDARD_THRESHOLDS = {
  http_req_duration: [
    'p(95)<3000', // 95% de las solicitudes deben responder en menos de 3000ms
    'p(50)<800',  // 50% de las solicitudes en menos de 800ms
  ],
  http_req_failed: [
    'rate<0.01',  // Menos del 1% de solicitudes con fallo (errores HTTP)
  ],
};

/**
 * Umbrales para RNF-02: Exportación segmentada por tamaño de proyecto
 * - size:small  < 1000 ms
 * - size:medium < 3000 ms
 * - size:large  < 8000 ms
 */
export const EXPORT_THRESHOLDS = {
  'http_req_duration{size:small}': ['p(95)<1000'],
  'http_req_duration{size:medium}': ['p(95)<3000'],
  'http_req_duration{size:large}': ['p(95)<8000'],
  http_req_failed: ['rate<0.01'],
};

/**
 * Umbrales para RNF-06: Generación con IA
 * - Control de latencia y tolerancia a rate-limits/timeouts transitorios
 */
export const AI_THRESHOLDS = {
  'http_req_duration': ['p(95)<45000'], // Generación compleja con timeout de hasta 45s
  'http_req_failed{status:500}': ['rate<0.01'], // No debe haber errores 500 no controlados
};

export default {
  BASE_URL,
  resolveEndpoint,
  authHeaders,
  STANDARD_THRESHOLDS,
  EXPORT_THRESHOLDS,
  AI_THRESHOLDS,
};
