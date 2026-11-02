const fs = require('node:fs');
const path = require('node:path');
const { PDFParse } = require('pdf-parse');
const root = path.resolve(__dirname, '../verification-results/extended');
const load = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
(async () => {
  const resilience = load('resilience.json'); const diversity = load('diversidad.json'); const ci = load('ci-github.json');
  const parser = new PDFParse({ data: fs.readFileSync(path.resolve(root, '../ui-interactions/documento.pdf')) });
  let extracted; try { extracted = await parser.getText(); } finally { await parser.destroy(); }
  const visual = {
    paginas: extracted.total, paginasRevisadasVisualmente: Array.from({ length: 23 }, (_, index) => index + 1),
    faltaTituloClasesDiseno: !/8\.3\s+Diagrama de Clases de Dise[ñn]o/i.test(extracted.text),
    hallazgos: [
      { gravedad: 'alta', paginas: [8, 9, 10, 11, 12], problema: 'Se exportan cinco diagramas; falta clases de diseño (sección 8.3).', evidenciaCodigo: 'ProjectWorkspace usa designClassDiagram; DocumentViewer y PdfPreviewModal consultan designClasses.' },
      { gravedad: 'media', paginas: [4, 5], problema: 'Títulos largos de RF recortados a la derecha en las cabeceras de tabla.' },
      { gravedad: 'media', paginas: [3, 4, 6, 7, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23], problema: 'Tablas partidas sin repetir identificación y encabezados de mockups separados de su imagen por cambio de página.' },
      { gravedad: 'media', paginas: [8, 10, 11], problema: 'Diagramas reducidos con texto pequeño; conviene orientación/tamaño específico o páginas ampliadas.' },
      { gravedad: 'media', paginas: [13, 16, 19, 20], problema: 'Solapamientos de texto o controles y áreas con scroll recortado en mockups. Requiere comparar con el original para atribuirlo a HTML o captura.' },
      { gravedad: 'media', paginas: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], problema: 'Trazabilidad excesiva: pantallas simples se asocian a casi todos los RF y se muestran identificadores RNF bajo Trazabilidad RF.' },
      { gravedad: 'media', paginas: [23], problema: 'La certificación formal redactada es más fuerte que las comprobaciones realizadas; no equivale a certificación normativa independiente.' }
    ],
    limites: 'Revisión humana de 23 páginas rasterizadas con Poppler y fuentes Liberation; no es una comparación píxel a píxel ni auditoría normativa.'
  };
  fs.writeFileSync(path.join(root, 'visual.json'), JSON.stringify(visual, null, 2));
  const lines = [
    '# Pruebas ampliadas de iCase — 1 de noviembre de 2026', '',
    'Se usaron nuevas bases y cuentas sintéticas. No se corrigió la aplicación para ocultar fallos ni se modificaron proyectos reales. Los fallos de IA/Docker de recuperación se inyectaron en procesos exclusivos; el reinicio y la persistencia MongoDB/HTTP fueron reales.', '',
    '## Historial, recuperación y aislamiento', '',
    `Resultado: ${resilience.correctas} comprobaciones correctas y ${resilience.fallidas} fallidas.`, '',
    '| Prueba | Resultado |', '| --- | --- |',
    ...resilience.pruebas.map(p => `| ${p.nombre} | ${p.estado}${p.error ? ': ' + p.error.replace(/\n/g, ' ').replace(/\|/g, '/') : ''} |`), '',
    'Aislamiento: 11 solicitudes cruzadas rechazadas con 404, con controles positivos del propietario para proyectos, fuentes, historial, trabajos y artefactos. El ZIP real verificado se descarga con su dueño y se rechaza con otro usuario. También se probó reasignación de un diagrama a un proyecto ajeno. No es una auditoría exhaustiva de penetración.', '',
    'El historial secuencial conserva contenido y tres restauraciones sin guardar no crean versiones. El caso concurrente pierde una edición pese a que ambas responden 200. La recuperación automática de diagramas sí funcionó tras matar y reiniciar el proceso (lease acelerada a 1,5 s); la de verificaciones no alcanza estado terminal hasta un reintento explícito. No se acredita recuperación de todos los tipos de trabajo ni expiración visual desde el navegador.', '',
    '## Diversidad con IA real', '',
    ...diversity.ingesta.map(i => `- ${i.archivo}: ${i.estado}; ${i.caracteres || 0} caracteres. PDF y audio sintéticos (voz local Sabina); no son grabaciones de usuario.`), '',
    ...diversity.escenarios.map(s => `- ${s.fuente} / ${s.proveedor}: ${s.estado}, ${s.requisitos || 0} requisitos, ${s.diagramas.length} diagramas. Sin evidencia válida: ${(s.sinEvidencia || []).length}.${s.error ? ' Motivo: ' + s.error : ''}`), '',
    'Se usaron Gemini 3.5 Flash Lite y Groq GPT-OSS 120B según configuración. Biblioteca/Gemini llegó a seis diagramas estructuralmente válidos; esto no certifica su semántica completa ni una entrega ZIP de ese dominio. Clínica/Groq generó requisitos pero sus diagramas fueron bloqueados por el presupuesto de contexto (7264 frente a 3000 tokens). Los 12 RF de biblioteca/Groq quedaron sin evidencia literal válida: requieren revisión, aunque la llamada haya terminado.', '',
    '## Revisión visual completa del PDF', '',
    `Se inspeccionaron las ${visual.paginas} páginas (imágenes en visual/).`, '',
    ...visual.hallazgos.map(h => '- ' + h.gravedad + '; páginas ' + h.paginas.join(', ') + ': ' + h.problema), '',
    '## CI/CD real', '',
    `Repositorio autorizado: https://github.com/ManuelNKI/icase-test. Commit del ZIP sin modificaciones funcionales: ${ci.commit}.`,
    `Ejecución: ${ci.url}. Resultado: ${ci.conclusion}.`, '',
    'Pasaron validación de artefactos, compilación de backend/frontend, bundle Android e instalación de dependencias de pruebas. Falló Audit Node dependencies: Playwright presenta GHSA-7mvr-c777-76hp (dos vulnerabilidades altas incluyendo su paquete dependiente). El bucle se detuvo antes de auditar mobile; la instalación móvil también había informado alertas, sin diagnóstico completo en esa compuerta.', '',
    'Los trabajos test y package quedaron omitidos. No se ejecutó despliegue externo: no hay destino cloud autorizado/configurado y el CI no llegó a su fase de pruebas. El despliegue Docker local del ZIP tiene evidencia separada y no sustituye esta ejecución de CI. No se deshabilitó npm audit ni se aplicó audit fix --force.', '',
    '## Prioridad de corrección', '',
    '1. Control de concurrencia/versión esperada en guardados.',
    '2. Recuperación o cierre explícito de verificaciones abandonadas tras reinicio.',
    '3. Dependencias de pruebas/móvil y coherencia entre auditoría local y CI.',
    '4. Alias de clases de diseño en el documento, paginación y fidelidad de mockups.',
    '5. Evidencia por requisito y contexto compacto para proveedores con presupuesto reducido.', '',
    'Evidencias: resilience.json, diversidad.json y sus salidas, visual.json, 23 imágenes, ci-github.json y ci-failure.log. No compartir archivos privados de sesión ni credenciales. El repositorio remoto contiene solo los archivos limpios del ZIP; no se publicó .env, claves de IA ni auxiliares privados.', ''
  ];
  fs.writeFileSync(path.join(root, 'resultado.md'), lines.join('\n'));
  console.log(JSON.stringify({ correctas: resilience.correctas, fallidas: resilience.fallidas, paginas: visual.paginas, faltaClasesDiseno: visual.faltaTituloClasesDiseno, ci: ci.conclusion }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
