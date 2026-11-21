const crypto = require('node:crypto');
const { renderRepositoryDocuments } = require('./DocumentationMarkdown');
const { buildRoleFlows, renderRoleFlows, buildTutorials, renderFlowSvg } = require('./DocumentationRoleFlows');

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paragraph = text => `<p>${escape(text)}</p>`;
const list = values => `<ul>${values.map(value => `<li>${escape(value)}</li>`).join('')}</ul>`;
const code = text => `<pre><code>${escape(text)}</code></pre>`;
const CSS = require('node:fs').readFileSync(require('node:path').join(__dirname, '../templates/documentation/documentation.css'), 'utf8');

/** Un paquete separado evita sobreescribir README, licencia o workflows del código generado. */
class ProjectDocumentationGenerator {
  generar({ proyecto, requerimientos = [], diagramas = [], artefactos = [], plan = null, opciones = {} }) {
    const approved = item => item.aprobado === true && !item.desactualizado && !['desactualizado', 'rechazado'].includes(item.estado);
    const rf = requerimientos.filter(item => approved(item) && String(item.tipo).toUpperCase() === 'RF');
    const rnf = requerimientos.filter(item => approved(item) && String(item.tipo).toUpperCase() === 'RNF');
    const latest = new Map();
    for (const diagram of diagramas.filter(approved)) {
      if (!latest.has(diagram.tipo) || Number(diagram.version || 1) > Number(latest.get(diagram.tipo).version || 1)) latest.set(diagram.tipo, diagram);
    }
    const latestArtifacts = new Map();
    for (const item of artefactos.filter(approved).filter(item => item.tipo !== 'paquete_entrega')) {
      if (!latestArtifacts.has(item.tipo) || Number(item.version || 1) > Number(latestArtifacts.get(item.tipo).version || 1)) latestArtifacts.set(item.tipo, item);
    }
    const artifacts = [...latestArtifacts.values()];
    const repository = artifacts.flatMap(item => item.archivos || []);
    const name = proyecto.nombre || 'Proyecto generado';
    const decisions = Object.fromEntries((plan?.etapas || []).filter(item => item.estado === 'aprobada').map(item => [item.etapa, item.propuesta]));
    const stack = decisions.stack_tecnologico || {};
    const flows = buildRoleFlows(rf, decisions);
    const tutorials = buildTutorials(flows, name);
    const warnings = [];
    const unassigned = flows.find(flow => flow.pending);
    if (unassigned) warnings.push(`${unassigned.steps.length} funciones no tienen un rol confirmado; se muestran por separado sin asignarlas a otros roles.`);
    if (!rf.length) warnings.push('No hay requisitos funcionales aprobados: el manual de usuario está pendiente de completar.');
    if (!latest.size) warnings.push('No hay diagramas aprobados y vigentes para esta versión.');
    if (!artifacts.length) warnings.push('No hay artefactos de código aprobados: la guía no acredita una aplicación ejecutable.');
    warnings.push('Las guías animadas explican los pasos documentados; no son evidencia de ejecución ni de pruebas funcionales.');
    const existingLicense = repository.find(file => /(^|\/)licen[cs]e(?:\.[\w-]+)?$/i.test(file.ruta));
    if (!existingLicense) warnings.push('Licencia pendiente de decisión del titular. No se concede una licencia de distribución automáticamente.');
    const files = [];
    const add = (ruta, contenido) => files.push({ ruta: `documentation/${ruta}`, contenido, lenguaje: ruta.endsWith('.md') ? 'markdown' : ruta.endsWith('.html') ? 'html' : 'text' });
    const flow = renderRoleFlows(flows);
    const requirementTable = `<table><thead><tr><th>Requisito</th><th>Función</th><th>Actores</th></tr></thead><tbody>${rf.map(item => `<tr><td>${escape(item.identificador)}</td><td>${escape(item.nombre)}</td><td>${escape(flows.filter(flow => flow.steps.some(step => step.id === String(item.identificador || item.id || '').toUpperCase())).map(flow => flow.role).join(', ') || 'Rol por confirmar')}</td></tr>`).join('')}</tbody></table>`;
    const pages = [
      { id: 'usuario', title: 'Manual de usuario', body: paragraph(`Guía de ${name}, derivada de los requisitos aprobados. Confirma permisos y datos de prueba antes de utilizar una función.`) + '<h2>Flujo de trabajo por roles</h2>' + flow + '<h2>Funcionalidades por rol</h2>' + requirementTable + rf.map(item => `<h3>${escape(item.identificador)} · ${escape(item.nombre)}</h3>${paragraph(item.descripcion)}${list([`Antes: ${item.precondiciones || 'Precondiciones no especificadas; confirmar con el responsable.'}`, `Resultado esperado: ${item.poscondiciones || 'Resultado no especificado; validar con el requisito aprobado.'}`])}`).join('') + '<h2>Guías animadas por rol</h2><div class="notice">Guías animadas del flujo documentado. No representan grabaciones de la aplicación ni certifican funcionalidades.</div><p>En I-CASE, abre Guías animadas para elegir un rol y reproducir su recorrido. Las guías se incorporan aquí al descargar el ZIP con guías.</p><div id="tutorial-videos"></div>' },
      { id: 'desarrollador', title: 'Guía de desarrollador', body: paragraph('Trabaja en una rama de Git, revisa los contratos y conserva la trazabilidad con los requisitos aprobados.') + '<h2>Tecnologías aprobadas</h2>' + list(Object.entries(stack).filter(([, value]) => typeof value === 'string').map(([key, value]) => `${key}: ${value}`)) + '<h2>Archivos del repositorio</h2>' + list(repository.filter(file => /(?:package\.json|pom\.xml|openapi\.json|README\.md)$/.test(file.ruta)).map(file => file.ruta)) + '<h2>Contribuir</h2>' + paragraph('Consulta CONTRIBUTING.md. Ejecuta las pruebas indicadas en cada módulo antes de abrir una revisión. No incluyas secretos ni datos personales.') + '<h2>Licencia</h2>' + paragraph(existingLicense ? `Se conserva la licencia de ${existingLicense.ruta}; consulta repository/ para el texto original.` : 'Pendiente de decisión del titular. El paquete no asigna una licencia por su cuenta.') },
      { id: 'mantenimiento', title: 'Manual de mantenimiento', body: '<h2>Operación y diagnóstico</h2>' + list(['Revisar disponibilidad, errores y capacidad de almacenamiento.', 'Consultar logs sin copiar tokens, contraseñas o información personal.', 'Comprobar la conexión de persistencia y los servicios definidos en ops/.env.', 'Registrar incidente, versión afectada, reproducción y resolución.']) + '<h2>Copias y recuperación</h2>' + paragraph(`Motor aprobado: ${stack.base_datos || 'no especificado'}. Programa copias de la base y de los volúmenes; verifica una restauración en un entorno separado antes de aceptar el respaldo. Define RPO y RTO con el responsable; no hay valores confirmados por defecto.`) + '<h2>Actualizar con revisión</h2>' + code('node tools/update.cjs --from RUTA_NUEVA') + paragraph('Este comando muestra una vista previa si la entrega incluye la herramienta. Revisa conflictos y respalda los datos antes de aplicar. No uses docker compose down -v sobre datos que deban conservarse.') + '<h2>Lista de verificación</h2>' + list(['Guardar versión y respaldo antes del cambio.', 'Revisar cambios de esquema y compatibilidad.', 'Probar arranque, permisos y funciones críticas.', 'Documentar plan de reversión y responsable.']) },
      { id: 'instalacion', title: 'Instalación y despliegue', body: '<h2>Requisitos</h2>' + paragraph(`Consulta los README originales para las versiones y comandos efectivos. Backend: ${stack.backend || 'por confirmar'}; frontend: ${stack.frontend || 'por confirmar'}; base de datos: ${stack.base_datos || 'por confirmar'}.`) + '<h2>Arranque de la entrega</h2>' + code('node tools/preview-local.cjs start\nnode tools/preview-local.cjs stop') + paragraph('Ejecuta desde la raíz de la entrega si contiene tools/preview-local.cjs. Docker debe estar disponible. Conserva ops/.env; nunca lo publiques.') + '<h2>Consultar este sitio</h2>' + code('cd documentation\npython -m pip install -r requirements.txt\npython -m mkdocs serve') + '<h2>Construir HTML y PDF</h2>' + code('python -m mkdocs build --strict\npython tools/export_pdf.py') + paragraph('El PDF se guarda en site/documentacion.pdf. Instala Chromium con python -m playwright install chromium la primera vez. También puedes usar Imprimir / Guardar como PDF en la vista completa.') + '<h2>GitHub Pages opcional</h2>' + paragraph(opciones.githubActions === true ? 'Incluido .github/workflows/documentation.yml en el ZIP, fuera de documentation/. Activa Pages → Source: GitHub Actions y ejecuta manualmente el workflow. Solo publica si seleccionas publicar=true. No se despliega al generar o descargar.' : 'No se incluye workflow de despliegue. Puedes regenerar el paquete marcando la opción GitHub Actions.') },
      { id: 'tecnica', title: 'Referencia técnica y diagramas', body: '<h2>Requisitos no funcionales</h2>' + list(rnf.map(item => `${item.identificador} · ${item.nombre}: ${item.metrica_medible || item.descripcion || 'Métrica pendiente'}`)) + '<h2>Diagramas aprobados</h2>' + [...latest.values()].map((diagram, i) => {
        const source = diagram.codigo_plantuml || diagram.codigo_mermaid || '';
        const extension = diagram.codigo_plantuml ? 'puml' : 'mmd';
        add(`docs/assets/diagram-${i + 1}.${extension}`, source);
        return `<h3>${escape(diagram.titulo || diagram.tipo)} · v${escape(diagram.version || 1)}</h3>${paragraph(diagram.descripcion || '')}<div data-diagram-index="${i}"></div><p>Fuente editable: assets/diagram-${i + 1}.${extension}. Si no se muestra la imagen, renderiza la fuente con PlantUML o Mermaid.</p><details><summary>Ver fuente editable</summary>${code(source)}</details>`;
      }).join('') + '<h2>Versiones de los artefactos</h2>' + list(artifacts.map(item => `${item.tipo}: v${item.version}; verificación ${item.verificacion?.estado || 'sin evidencia'}`)) + '<h2>Alcance</h2>' + paragraph('La documentación describe insumos aprobados; una función especificada no se considera implementada hasta revisar el código y las pruebas de la entrega. Consulta los informes originales incluidos en repository/.') }
    ];
    const repositoryDocs = repository.filter(file => /\.(md|markdown)$/i.test(file.ruta) || /(?:^|\/)licen[cs]e$/i.test(file.ruta));
    const renderedRepository = renderRepositoryDocuments(repositoryDocs);
    pages[1].body += '<h2>Documentación del repositorio</h2>' + paragraph('Los documentos se muestran con su formato Markdown. También puedes consultar la fuente original de cada archivo.') + renderedRepository;
    add('docs/repositorio.md', '<h1>Documentación del repositorio</h1>' + paragraph('Documentos renderizados de los artefactos aprobados. Las fuentes originales se conservan en repository/.') + renderedRepository);
    const contract = repository.find(file => /(?:^|\/)openapi\.json$/.test(file.ruta));
    if (contract) {
      try {
        const api = JSON.parse(contract.contenido);
        pages[4].body += '<h2>Contrato API</h2>' + list(Object.entries(api.paths || {}).flatMap(([route, operations]) => Object.entries(operations).filter(([method]) => ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)).map(([method, operation]) => `${method.toUpperCase()} ${route}: ${operation.summary || operation.operationId || 'Sin descripción'}`)));
      } catch { warnings.push('El contrato OpenAPI no es JSON válido; revisa el archivo original.'); }
    }
    const render = page => `<section class="manual-section" id="${page.id}"><h1>${escape(page.title)}</h1>${page.body}</section>`;
    const renderDocument = (selected, includeWarnings = true) => `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(name)} · Documentación</title><style>${CSS}</style></head><body${selected.length === 1 ? ' class="single-manual"' : ''}><header class="doc-header"><p class="eyebrow">DOCUMENTACIÓN DEL PROYECTO</p><h1>${escape(name)}</h1>${paragraph(proyecto.descripcion || '')}${selected.length > 1 ? `<nav class="manual-nav">${selected.map(page => `<a href="#${page.id}">${escape(page.title)}</a>`).join('')}</nav>` : ''}</header><main>${includeWarnings ? `<div class="notice">${list(warnings)}</div>` : ''}${selected.map(render).join('')}</main></body></html>`;
    const documentHtml = renderDocument(pages);
    add('docs/index.md', `<h1>${escape(name)}</h1>${paragraph(proyecto.descripcion || '')}${list(warnings)}<h2>Cinco tipos de documentación</h2>${list(pages.map(page => page.title))}<p><a href="manual-completo.html">Abrir manual completo para imprimir o guardar como PDF</a></p>`);
    pages.forEach(page => add(`docs/${page.id}.md`, `<h1>${escape(page.title)}</h1>\n\n${page.body}\n`));
    add('docs/manual-completo.html', documentHtml);
    add('docs/assets/documentation.css', CSS);
    add('docs/assets/flujo.svg', renderFlowSvg(flows));
    add('mkdocs.yml', `site_name: ${JSON.stringify(name)}\nsite_description: "Documentación del proyecto generado por I-CASE"\nuse_directory_urls: false\ntheme:\n  name: mkdocs\n  locale: es\nnav:\n  - Inicio: index.md\n${pages.map(page => `  - ${JSON.stringify(page.title)}: ${page.id}.md`).join('\n')}\n  - Documentos del repositorio: repositorio.md\n  - Manual completo y PDF: manual-completo.html\nextra_css:\n  - assets/documentation.css\nmarkdown_extensions:\n  - tables\n  - fenced_code\n`);
    add('requirements.txt', 'mkdocs==1.6.1\nplaywright==1.65.0\n');
    add('tools/export_pdf.py', require('node:fs').readFileSync(require('node:path').join(__dirname, '../templates/documentation/export_pdf.py'), 'utf8'));
    add('README.md', `# Documentación de ${name}\n\nCinco manuales generados con MkDocs a partir de los insumos aprobados.\n\nDesde esta carpeta:\n\n\`\`\`sh\npython -m pip install -r requirements.txt\npython -m playwright install chromium\npython -m mkdocs serve\n\`\`\`\n\nHTML: \`python -m mkdocs build --strict\`. PDF: \`python tools/export_pdf.py\` (construye el sitio si hace falta).\n\nLa vista completa también permite imprimir como PDF. La infografía de recorridos separados por rol está en docs/assets/flujo.svg. Las guías animadas se agregan desde la aplicación al descargar el ZIP con videos.\n\n${warnings.map(item => '- ' + item).join('\n')}\n`);
    add('CONTRIBUTING.md', '# Contribuir\n\n1. Crea una rama desde la rama acordada por el equipo.\n2. Vincula cambios con requisitos y decisiones aprobadas.\n3. Ejecuta las pruebas de cada módulo y `python -m mkdocs build --strict` desde documentation/.\n4. Revisa HTML, diagramas, videos y PDF.\n5. Abre una revisión y registra incompatibilidades.\n\nNunca agregues secretos o datos reales a ejemplos, capturas o videos.\n');
    add('LICENSE.md', existingLicense ? existingLicense.contenido : '# Licencia pendiente\n\nEl titular debe escoger y aprobar una licencia antes de distribuir el proyecto. Este archivo no concede permisos de distribución ni sustituye esa decisión.\n');
    for (const file of repositoryDocs) {
      if (file.ruta.split(/[\\/]/).some(part => part === '..') || /^[\\/]|^[a-z]:/i.test(file.ruta)) continue;
      add(`repository/${file.ruta}`, file.contenido);
    }
    if (opciones.githubActions === true) files.push({ ruta: '.github/workflows/documentation.yml', lenguaje: 'yaml', contenido: require('node:fs').readFileSync(require('node:path').join(__dirname, '../templates/documentation/workflow.yml'), 'utf8') });
    const manifest = { version: 2, flujos: flows.map(flow => ({ rol: flow.role, requisitos: flow.steps.map(step => step.id) })), videos: tutorials.map(({ id, role, title }) => ({ id, role, title })), proyecto: name, categorias: pages.map(({ id, title }) => ({ id, title })), requisitos: rf.map(item => item.identificador), diagramas: [...latest.values()].map(item => ({ tipo: item.tipo, version: item.version })), artefactos: artifacts.map(item => ({ tipo: item.tipo, version: item.version })), github_actions: opciones.githubActions === true, advertencias: warnings, archivos: files.map(file => ({ ruta: file.ruta, sha256: crypto.createHash('sha256').update(file.contenido).digest('hex') })) };
    add('documentation-manifest.json', JSON.stringify(manifest, null, 2));
    return { archivos: files, html: documentHtml, paginas: pages.map(page => ({ id: page.id, title: page.title, html: renderDocument([page], false) })), categorias: manifest.categorias, flujos: flows, advertencias: warnings, diagramas: [...latest.values()].map(item => ({ codigo_plantuml: item.codigo_plantuml || '', codigo_mermaid: item.codigo_mermaid || '', titulo: item.titulo || item.tipo })), videos: tutorials };
  }
}
module.exports = ProjectDocumentationGenerator;
