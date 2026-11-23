const MarkdownIt = require('markdown-it');
const { criterionText } = require('./DocumentationFacts');
const text = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\|/g, '\\|');
const table = (headers, rows) => `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map(row => '| ' + row.map(text).join(' | ') + ' |').join('\n')}\n`;
const list = items => items.length ? items.map(item => `- ${text(item)}`).join('\n') : 'No especificado en las fuentes aprobadas.';
function report(bundle, state) {
  const input = bundle.informe || {}, project = input.proyecto || {}, stack = input.decisiones?.stack_tecnologico || {};
  const requirements = input.requerimientos || [], models = input.modelo?.entidades || bundle.hechos.models;
  const sections = [
    `# Informe final: ${text(bundle.proyecto.nombre)}\n\n${text(bundle.proyecto.descripcion)}\n\nVersión documental: ${state.version}. Fuentes: requisitos, diagramas, diseños y artefactos aprobados.`,
    `## Resumen e introducción\n\n${text(project.resumen || project.descripcion || '')}\n\n${text(project.introduccion || '')}`,
    `## Objetivos aprobados\n\n### Objetivo general\n\n${text(project.objetivo_general || 'No especificado.')}\n\n### Objetivos específicos\n\n${list(project.objetivos_especificos || [])}`,
    ...['RF', 'RNF'].map(type => `## Requisitos ${type === 'RF' ? 'funcionales' : 'no funcionales'}\n\n${requirements.filter(item => item.tipo === type).map(item => `### ${text(item.identificador)}: ${text(item.nombre)}\n\n${text(item.descripcion || '')}\n\n${item.metrica_medible ? '**Métrica:** ' + text(item.metrica_medible) + '\n\n' : ''}${item.precondiciones ? '**Antes:** ' + text(item.precondiciones) + '\n\n' : ''}${item.poscondiciones ? '**Resultado:** ' + text(item.poscondiciones) + '\n\n' : ''}**Criterios de aceptación**\n\n${list((Array.isArray(item.criterios_aceptacion) ? item.criterios_aceptacion : item.criterios_aceptacion ? [item.criterios_aceptacion] : []).map(criterionText))}`).join('\n\n')}`),
    `## Recorridos por rol\n\n${bundle.flujos.map(flow => `### ${text(flow.role)}\n\n${list(flow.steps.map(step => `${step.id}: ${step.title}`))}`).join('\n\n')}`,
    `## Tecnologías aprobadas\n\n${table(['Decisión', 'Tecnología'], Object.entries(stack).filter(([, value]) => typeof value !== 'object').map(([key, value]) => [key, value]))}\n\nLas decisiones completas se conservan en decisiones-aprobadas.json; no se incorporan volcados internos al informe.`,
    `## Modelo de datos\n\n${table(['Entidad', 'Atributos', 'Relaciones'], models.map(model => [model.nombre || model.name, model.atributos || (model.fields || []).join(', '), model.relaciones || model.descripcion || 'No declaradas']))}`,
    `## Contrato de API\n\n${table(['Método', 'Ruta', 'Descripción'], bundle.hechos.endpoints.map(endpoint => [endpoint.method, endpoint.route, endpoint.description]))}`,
    `## Diagramas aprobados\n\n${bundle.diagramas.map((diagram, index) => `### ${text(diagram.titulo || diagram.tipo)}\n\nVersión ${diagram.version || 1}.\n\n![Diagrama aprobado](documentation/docs/assets/diagram-${index + 1}.svg)\n`).join('\n')}`,
    `## Navegación y trazabilidad de pantallas\n\n${table(['Pantalla', 'Módulo', 'Roles', 'Requisitos'], bundle.pantallas.map(screen => [screen.nombre_visible || screen.nombre_pantalla, screen.modulo || '', (screen.roles || []).join(', '), (screen.rf_trazabilidad || []).join(', ')]))}`,
    `## Diseños aprobados\n\nLas capturas representan los mockups aprobados. No certifican que la aplicación esté ejecutándose.\n\n${bundle.pantallas.map((screen, index) => `### ${index + 1}. ${text(screen.nombre_visible || screen.nombre_pantalla)}\n\n![Mockup aprobado](documentation/docs/assets/capturas/${index + 1}.png)\n`).join('\n')}`,
    `## Versiones de origen\n\n${table(['Artefacto', 'Versión'], bundle.manifiesto.fuentes.artefactos.map(item => [item.tipo, item.version]))}\n\n## Avisos y decisiones pendientes\n\n${list(state.advertencias.length ? state.advertencias : ['No hay avisos documentales. La documentación no sustituye la validación funcional.'])}`
  ];
  const markdown = sections.join('\n\n');
  const css = 'body{font:11pt Arial,sans-serif;color:#263146;line-height:1.5;margin:0}h1,h2,h3{color:#4c1d95;break-after:avoid}h1{font-size:25pt}h2{font-size:18pt;border-bottom:1px solid #ddd6fe;padding-bottom:7px;margin-top:24px}h3{font-size:13pt}img{max-width:100%;max-height:225mm;object-fit:contain}p,li,td{overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:9pt;margin:15px 0}th{background:#f5f3ff;text-align:left}td,th{border:1px solid #ddd6fe;padding:7px}thead{display:table-header-group}pre{white-space:pre-wrap}tr{break-inside:avoid}@page{size:A4;margin:18mm}';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe final</title><style>${css}</style></head><body>${new MarkdownIt({ html: false }).render(markdown)}</body></html>`;
  return { markdown, html };
}
module.exports = report;
