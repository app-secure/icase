import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
import {
  resolveEndpoint,
  authHeaders,
  EXPORT_THRESHOLDS,
} from '../config/thresholds.js';

// Cargar datos parametrizados de prueba
const testData = JSON.parse(open('../config/test-data.json'));
const users = testData.users;
const projects = testData.projects;

// Métricas personalizadas por tamaño
const smallExportLatency = new Trend('export_duration_small_ms');
const mediumExportLatency = new Trend('export_duration_medium_ms');
const largeExportLatency = new Trend('export_duration_large_ms');
const integritySuccessRate = new Rate('export_integrity_success');
const exportErrors = new Counter('export_errors_total');

export const options = {
  stages: [
    { duration: '15s', target: 5 }, // Carga moderada de 5 VUs concurrentes
    { duration: '1m', target: 5 },  // Evaluación continua
    { duration: '15s', target: 0 }, // Cierre
  ],
  thresholds: {
    ...EXPORT_THRESHOLDS,
    export_integrity_success: ['rate>0.95'],
    export_errors_total: ['count<5'],
  },
};

export default function () {
  const user = users[(__VU - 1) % users.length];
  const headers = authHeaders(user.token);

  // Iterar de forma balanceada sobre los proyectos de tamaño small, medium y large
  for (const project of projects) {
    const sizeTag = { tags: { size: project.size, project_id: project.id } };

    // 1. Exportación de Especificación en Markdown (/proyectos/:id/exportar-markdown)
    const mdUrl = resolveEndpoint(`/proyectos/${project.id}/exportar-markdown`);
    const mdRes = http.get(mdUrl, { headers, tags: { ...sizeTag.tags, endpoint: 'exportar-markdown' } });
    
    // Registrar métricas por tamaño
    if (project.size === 'small') smallExportLatency.add(mdRes.timings.duration);
    else if (project.size === 'medium') mediumExportLatency.add(mdRes.timings.duration);
    else if (project.size === 'large') largeExportLatency.add(mdRes.timings.duration);

    const mdOk = check(mdRes, {
      [`[${project.size}] Markdown status valid (200 o 404)`]: (r) => r.status === 200 || r.status === 404,
      [`[${project.size}] Markdown body integridad > 0`]: (r) => r.status === 200 ? (r.body && r.body.length > 0) : true,
      [`[${project.size}] Markdown sin caída 5xx`]: (r) => r.status < 500,
    });
    integritySuccessRate.add(mdOk);
    if (!mdOk && mdRes.status >= 500) exportErrors.add(1);

    // 2. Exportación de Documento Consolidado JSON (/proyectos/:id/documento-consolidado)
    const docUrl = resolveEndpoint(`/proyectos/${project.id}/documento-consolidado`);
    const docRes = http.get(docUrl, { headers, tags: { ...sizeTag.tags, endpoint: 'documento-consolidado' } });

    if (project.size === 'small') smallExportLatency.add(docRes.timings.duration);
    else if (project.size === 'medium') mediumExportLatency.add(docRes.timings.duration);
    else if (project.size === 'large') largeExportLatency.add(docRes.timings.duration);

    const docOk = check(docRes, {
      [`[${project.size}] Consolidado status valid`]: (r) => r.status === 200 || r.status === 404,
      [`[${project.size}] Consolidado integridad`]: (r) => r.status === 200 ? (r.body && r.body.length > 0) : true,
      [`[${project.size}] Consolidado sin caída 5xx`]: (r) => r.status < 500,
    });
    integritySuccessRate.add(docOk);
    if (!docOk && docRes.status >= 500) exportErrors.add(1);

    // 3. Exportación de Paquete Completo de Transferencia (/proyectos/:id/transferencia/exportar)
    const bundleUrl = resolveEndpoint(`/proyectos/${project.id}/transferencia/exportar`);
    const bundleRes = http.get(bundleUrl, { headers, tags: { ...sizeTag.tags, endpoint: 'transferencia-exportar' } });

    if (project.size === 'small') smallExportLatency.add(bundleRes.timings.duration);
    else if (project.size === 'medium') mediumExportLatency.add(bundleRes.timings.duration);
    else if (project.size === 'large') largeExportLatency.add(bundleRes.timings.duration);

    const bundleOk = check(bundleRes, {
      [`[${project.size}] Transferencia bundle valid`]: (r) => r.status === 200 || r.status === 404,
      [`[${project.size}] Transferencia sin caída 5xx`]: (r) => r.status < 500,
    });
    integritySuccessRate.add(bundleOk);
    if (!bundleOk && bundleRes.status >= 500) exportErrors.add(1);

    // 4. Descarga de Código Fuente Empaquetado (/proyectos/:id/artefactos/:artefactoId/descargar)
    if (project.artefactoId) {
      const artUrl = resolveEndpoint(`/proyectos/${project.id}/artefactos/${project.artefactoId}/descargar`);
      const artRes = http.get(artUrl, { headers, tags: { ...sizeTag.tags, endpoint: 'artefacto-descargar' } });

      const artOk = check(artRes, {
        [`[${project.size}] Descarga artefacto valid (200 o 404)`]: (r) => r.status === 200 || r.status === 404,
        [`[${project.size}] Descarga artefacto sin caída 5xx`]: (r) => r.status < 500,
      });
      integritySuccessRate.add(artOk);
      if (!artOk && artRes.status >= 500) exportErrors.add(1);
    }

    sleep(0.5); // Breve intervalo entre tamaños
  }

  sleep(1);
}

/**
 * Exportación automática del resumen de rendimiento de exportación
 */
export function handleSummary(data) {
  return {
    'tests/performance/results/summary-export.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
