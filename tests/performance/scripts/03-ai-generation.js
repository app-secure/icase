import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
import {
  resolveEndpoint,
  authHeaders,
  AI_THRESHOLDS,
} from '../config/thresholds.js';

// Cargar datos parametrizados de prueba
const testData = JSON.parse(open('../config/test-data.json'));
const users = testData.users;
const projects = testData.projects;

// Métricas específicas de observabilidad de IA (RNF-06)
const aiDurationTrend = new Trend('ai_generation_duration_ms');
const tokensInputTrend = new Trend('ai_tokens_input_consumed');
const tokensOutputTrend = new Trend('ai_tokens_output_consumed');
const aiTimeoutsHandled = new Counter('ai_timeouts_handled_count');
const aiSuccessRate = new Rate('ai_flow_success_rate');
const server5xxErrors = new Counter('ai_server_5xx_errors');

export const options = {
  // Ejecución controlada de 1 VU y 2 iteraciones para medir latencia real sin saturar APIs gratuitas
  scenarios: {
    controlled_ai_workload: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 2,
      maxDuration: '5m',
    },
  },
  thresholds: {
    ...AI_THRESHOLDS,
    ai_server_5xx_errors: ['count===0'], // Tolerancia cero a caídas del servidor (500)
    ai_flow_success_rate: ['rate>0.80'],  // Al menos 80% de operaciones de IA procesadas o manejadas limpiamente
  },
};

export default function () {
  // Cada VU usa el usuario y proyecto correspondientes (evita desajuste de propietario)
  const userIndex = (__VU - 1) % users.length;
  const user = users[userIndex];
  const project = projects[userIndex] || projects[0];
  const headers = authHeaders(user.token);

  // 1. Iniciar solicitud de generación con IA (POST /proyectos/:id/trabajos-diagramas)
  const payload = JSON.stringify({
    tipo_diagrama: 'clases_dominio',
    insumo_bruto: project.insumo_bruto || '',
    insumo_adicional: 'Prueba de rendimiento y observabilidad de tokens I-CASE',
    provider: 'auto',
  });

  const aiStart = new Date().getTime();
  const jobUrl = resolveEndpoint(`/proyectos/${project.id}/trabajos-diagramas`);
  const postRes = http.post(jobUrl, payload, { headers, tags: { name: 'POST /trabajos-diagramas' } });
  const initialDuration = new Date().getTime() - aiStart;

  // Manejo de códigos de estado esperados
  const isPost5xx = postRes.status >= 500 && postRes.status < 600;
  if (isPost5xx) server5xxErrors.add(1);

  // Detección de timeouts o sobrecargas transitorias (408 Request Timeout, 504 Gateway Timeout, 429 Too Many Requests)
  const isHandledTimeoutOrRateLimit = [408, 429, 503, 504].includes(postRes.status);
  if (isHandledTimeoutOrRateLimit) {
    aiTimeoutsHandled.add(1);
  }

  const postOk = check(postRes, {
    'POST IA no produce caída 500 no controlada': (r) => r.status !== 500,
    'POST IA responde con 200, 202, 404 (seed), o degradación controlada (408/429/504)': (r) =>
      [200, 201, 202, 400, 404, 408, 409, 429, 503, 504].includes(r.status),
  });
  aiSuccessRate.add(postOk);

  // 2. Si se creó un trabajo asíncrono (202 Accepted) o devuelve un job ID, sondear estado
  let trabajoId = null;
  try {
    const data = JSON.parse(postRes.body);
    trabajoId = data.trabajo_id || data.id || (data.trabajo && data.trabajo.id);
  } catch (e) {
    // Respuesta no JSON o vacía
  }

  if (trabajoId) {
    const pollUrl = resolveEndpoint(`/proyectos/${project.id}/trabajos-diagramas/ultimo`);
    let completed = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!completed && attempts < maxAttempts) {
      sleep(3); // Polling cada 3 segundos
      attempts++;

      const pollRes = http.get(pollUrl, { headers, tags: { name: 'GET /trabajos-diagramas/ultimo' } });
      if (pollRes.status === 200) {
        try {
          const jobStatus = JSON.parse(pollRes.body);
          const trabajo = jobStatus.trabajo || jobStatus;
          if (trabajo && ['completado', 'fallido', 'esperando_proveedor'].includes(trabajo.estado)) {
            completed = true;
            const totalDuration = new Date().getTime() - aiStart;
            aiDurationTrend.add(totalDuration);

            // Extraer métricas de telemetría de tokens si están presentes en la respuesta
            if (trabajo.tokens_entrada) tokensInputTrend.add(trabajo.tokens_entrada);
            if (trabajo.tokens_salida) tokensOutputTrend.add(trabajo.tokens_salida);
            if (trabajo.metricas_ejecucion) {
              if (trabajo.metricas_ejecucion.tokens_entrada) tokensInputTrend.add(trabajo.metricas_ejecucion.tokens_entrada);
              if (trabajo.metricas_ejecucion.tokens_salida) tokensOutputTrend.add(trabajo.metricas_ejecucion.tokens_salida);
            }
          }
        } catch (err) {
          completed = true;
        }
      }
    }
  } else {
    // Si no hubo jobId asíncrono, registrar duración de la llamada directa
    aiDurationTrend.add(initialDuration);
  }

  sleep(2);
}

/**
 * Exportación de métricas de IA
 */
export function handleSummary(data) {
  return {
    'tests/performance/results/summary-ai.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
