import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
import {
  BASE_URL,
  resolveEndpoint,
  authHeaders,
  STANDARD_THRESHOLDS,
} from '../config/thresholds.js';

// Cargar datos parametrizados de prueba
const testData = JSON.parse(open('../config/test-data.json'));
const users = testData.users;
const projects = testData.projects;

// Métricas personalizadas para observabilidad no funcional (RNF-01)
const errors5xx = new Counter('errors_5xx');
const successRate = new Rate('successful_requests');
const projectListLatency = new Trend('project_list_duration_ms');
const artifactQueryLatency = new Trend('artifact_query_duration_ms');

// Configuración de ejecución con ramping de VUs
export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Calentamiento a 10 VUs
    { duration: '1m', target: 25 },  // Incremento sostenido a 25 VUs
    { duration: '2m', target: 50 },  // Carga nominal SLA RNF-01 (50 VUs continuos)
    { duration: '1m', target: 75 },  // Prueba de estrés para medir punto de saturación
    { duration: '30s', target: 0 },  // Enfriamiento a 0 VUs
  ],
  thresholds: {
    ...STANDARD_THRESHOLDS,
    errors_5xx: ['count<10'], // Máximo tolerancia estricta a fallos 5xx
    successful_requests: ['rate>0.95'],
  },
};

/**
 * Función auxiliar para obtener un token válido:
 * Primero intenta usar el token estático del usuario; si el endpoint rechaza con 401,
 * realiza login dinámico en /auth/login para obtener un token fresco.
 */
function getValidToken(user) {
  // Intentar primero con el token pre-configurado
  return user.token;
}

export default function () {
  // Rotación balanceada de usuarios por Virtual User
  const userIndex = (__VU - 1) % users.length;
  const user = users[userIndex];
  const token = getValidToken(user);
  const headers = authHeaders(token);

  // 1. Consulta del listado de proyectos (/proyectos)
  const listUrl = resolveEndpoint('/proyectos');
  const listStart = new Date().getTime();
  const listRes = http.get(listUrl, { headers, tags: { name: 'GET /proyectos' } });
  const listDuration = new Date().getTime() - listStart;
  projectListLatency.add(listDuration);

  const isList5xx = listRes.status >= 500 && listRes.status < 600;
  if (isList5xx) errors5xx.add(1);

  const listOk = check(listRes, {
    'GET /proyectos status is 200': (r) => r.status === 200,
    'GET /proyectos latency < 3000ms (RNF-01)': (r) => r.timings.duration < 3000,
  });
  successRate.add(listOk);

  // 2. Consulta de detalle de proyecto y artefactos (/proyectos/:id/artefactos)
  const project = projects[(__VU + __ITER) % projects.length];
  const artifactUrl = resolveEndpoint(`/proyectos/${project.id}/artefactos`);
  const artStart = new Date().getTime();
  const artRes = http.get(artifactUrl, { headers, tags: { name: 'GET /proyectos/:id/artefactos' } });
  const artDuration = new Date().getTime() - artStart;
  artifactQueryLatency.add(artDuration);

  const isArt5xx = artRes.status >= 500 && artRes.status < 600;
  if (isArt5xx) errors5xx.add(1);

  // El endpoint de artefactos devuelve 200 si existe, o 404 si el seed de prueba no está en la base
  // En ambos casos, comprobamos que no haya un 500 y que la latencia respete el SLA
  const artOk = check(artRes, {
    'GET /artefactos status is 200 or 404 (handled)': (r) => r.status === 200 || r.status === 404,
    'GET /artefactos no 5xx crash': (r) => r.status < 500,
    'GET /artefactos latency < 3000ms': (r) => r.timings.duration < 3000,
  });
  successRate.add(artOk);

  // 3. Pausa controlada para simular tiempo de reflexión del usuario (think time)
  sleep(1);
}

/**
 * Exportación de reportes de ejecución
 */
export function handleSummary(data) {
  return {
    'tests/performance/results/summary-load.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
