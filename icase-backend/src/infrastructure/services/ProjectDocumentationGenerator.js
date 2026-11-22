const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');
const { buildRoleFlows, buildTutorials } = require('./DocumentationRoleFlows');
const { approved, safePath, latestApproved, deliveryFacts, criterionText } = require('./DocumentationFacts');
const { buildInfographics } = require('./DocumentationInfographics');
const { CODE_PHASE_DEFINITIONS } = require('../../core/constants/CodeGenerationPhases');
const md = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\|/g, '\\|');
const bullets = items => items.length ? items.map(item => `- ${md(item)}`).join('\n') : '- No consta en los artefactos aprobados.';
const fence = (text, language = 'sh') => `\n\n\`\`\`${language}\n${text}\n\`\`\`\n\n`;
const table = (headers, rows) => `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map(row => '| ' + row.map(md).join(' | ') + ' |').join('\n')}\n`;
const titles = { usuario: 'Manual de usuario', desarrollador: 'Guía de desarrollador', mantenimiento: 'Manual de mantenimiento', instalacion: 'Instalación y despliegue', tecnica: 'Referencia técnica y diagramas' };
const template = name => fs.readFileSync(path.join(__dirname, '../templates/documentation', name), 'utf8');

/** Las páginas Markdown son la única fuente editorial del sitio y de su PDF. */
class ProjectDocumentationGenerator {
  generar({ proyecto, requerimientos = [], diagramas = [], artefactos = [], plan = null, diseno = null, opciones = {} }) {
    const requirements = requerimientos.filter(approved), rf = requirements.filter(item => item.tipo === 'RF');
    const artifacts = latestApproved(artefactos.filter(item => item.tipo !== 'paquete_entrega'));
    const repository = artifacts.flatMap(item => item.archivos || []).filter(file => safePath(file.ruta));
    const facts = deliveryFacts(repository), diagrams = latestApproved(diagramas);
    const decisions = Object.fromEntries((plan?.etapas || []).filter(item => item.estado === 'aprobada' && CODE_PHASE_DEFINITIONS[item.etapa]?.tipo === 'decision').map(item => [item.etapa, item.propuesta]));
    const flows = buildRoleFlows(rf, decisions);
    const approvedDesign = diseno?.aprobado === true || ['mockups_aprobados', 'diseno_aprobado', 'finalizado'].includes(proyecto.estado_fase);
    const screens = (diseno?.mockups || []).filter(screen => (screen.estado === 'aprobado' || approvedDesign) && screen.preview_code && screen.estado_calidad !== 'invalido');
    const name = md(proyecto.nombre || 'Proyecto generado');
    const warnings = [...facts.warnings];
    if (!rf.length) warnings.push('No hay requisitos funcionales aprobados.');
    if (!screens.length) warnings.push('No hay mockups aprobados disponibles para capturas.');
    if (flows.some(flow => flow.pending)) warnings.push('Hay funciones cuyo rol debe confirmarse. No se asignan a otro rol.');
    const files = [], add = (ruta, contenido) => files.push({ ruta, contenido: String(contenido), lenguaje: ruta.endsWith('.md') ? 'markdown' : 'text' });
    const addDoc = (ruta, contenido) => add(`documentation/${ruta}`, contenido);
    const existingLicense = repository.find(file => /(^|\/)licen[cs]e(?:\.md|\.txt)?$/i.test(file.ruta));
    const license = opciones.licencia || (existingLicense ? 'conservar' : 'pendiente');
    if (!['pendiente', 'conservar', 'MIT', 'Apache-2.0', 'propietaria'].includes(license)) throw new Error('Licencia no válida.');
    if (license === 'conservar' && !existingLicense) throw new Error('No existe una licencia para conservar.');
    const holder = md(opciones.titular || proyecto.nombre || 'Titular del proyecto');
    const year = new Date().getFullYear();
    let licenseText = existingLicense?.contenido || '# Decisión de licencia pendiente\n\nSelecciona una licencia y el titular en I-CASE antes de distribuir la entrega. Este documento no concede permisos.\n';
    if (license === 'MIT') licenseText = template('LICENSE-MIT.txt').replaceAll('{{YEAR}}', year).replaceAll('{{HOLDER}}', holder);
    if (license === 'Apache-2.0') licenseText = `Copyright ${year} ${holder}\n\n` + template('LICENSE-APACHE.txt');
    if (license === 'propietaria') licenseText = `Copyright ${year} ${holder}. Todos los derechos reservados.\n\nNo se permite usar, copiar, modificar ni distribuir este software sin autorización escrita del titular, salvo los derechos establecidos por la legislación aplicable.\n`;
    if (license === 'pendiente') warnings.push('Selecciona la licencia y el titular antes de distribuir el proyecto.');

    const screenName = screen => md(screen.nombre_visible || screen.nombre_pantalla);
    const rolesMarkdown = flows.map(flow => `## ${md(flow.role)}\n\n${flow.pending ? '> Rol pendiente de confirmar.\n\n' : ''}${flow.steps.map((step, i) => {
      const requirement = rf.find(item => String(item.identificador).toUpperCase() === step.id);
      const related = screens.filter(screen => (screen.rf_trazabilidad || []).includes(step.id) && (!(screen.roles || []).length || screen.roles.some(role => String(role).toLowerCase() === flow.role.toLowerCase())));
      const criteria = requirement?.criterios_aceptacion || requirement?.criteriosAceptacion || [];
      const fields = [...new Set(related.flatMap(screen => (screen.campos_formulario || []).map(field => `${field.nombre}${field.requerido ? ' (obligatorio)' : ''}${field.validacion ? ': ' + field.validacion : ''}`)))];
      const actions = [...new Set(related.flatMap(screen => screen.acciones_principales || []))];
      return `### ${i + 1}. ${md(step.title)} (${md(step.id)})\n\n${md(step.description)}\n\n1. **Antes:** ${md(step.before)}\n2. **Abre la pantalla:** ${related.length ? related.map(screenName).join(' o ') + '.' : 'Pantalla asociada pendiente de confirmar; consulta el requisito aprobado.'}\n3. **Prepara los datos:** ${fields.length ? fields.map(md).join('; ') + '.' : 'No hay campos documentados en estas pantallas.'}\n4. **Ejecuta la acción:** ${actions.length ? actions.map(md).join('; ') + '.' : 'Consulta los controles aprobados de la pantalla; no hay acciones descritas.'}\n5. **Comprueba:** ${md(step.outcome)}\n\n**Criterios de aceptación aprobados**\n\n${bullets(Array.isArray(criteria) ? criteria.map(criterionText) : [String(criteria)])}\n\n${related.map(screen => `![${screenName(screen)}](assets/capturas/${screens.indexOf(screen) + 1}.png)`).join('\n\n')}\n`;
    }).join('\n')}`).join('\n');
    const commands = facts.commands.map(command => `${command.run}  # ${command.command}`).join('\n');
    const compose = facts.services.map(service => [service.name, service.source, service.ports.map(port => typeof port === 'object' ? JSON.stringify(port) : port).join(', ') || 'Internos', service.health.join(' ') || 'No declarado']);
    const env = table(['Variable', 'Archivo', 'Configuración'], facts.variables.map(variable => [variable.name, variable.source, variable.value]));
    const endpoints = table(['Método', 'Ruta', 'Descripción'], facts.endpoints.map(endpoint => [endpoint.method, endpoint.route, endpoint.description]));
    const tree = [...new Set(facts.paths.map(file => file.split('/').slice(0, 2).join('/')))].sort().join('\n');
    const modules = facts.packages.flatMap(pkg => pkg.dependencies);
    const diagnostics = [
      ...facts.services.map(service => `Si ${service.name} no está saludable, revisa el healthcheck declarado en ${service.source}: ${service.health.join(' ') || 'no declarado'}. Comprueba dependencias: ${service.depends.join(', ') || 'ninguna declarada'}.`),
      ...(modules.includes('mongoose') ? ['MongoDB: revisa conectividad, autenticación y disponibilidad de la réplica si se utilizan transacciones.'] : []),
      ...(modules.includes('redis') ? ['Redis: comprueba su conexión y el prefijo de las claves; no vacíes cachés compartidas sin revisar su alcance.'] : []),
      ...(modules.includes('nodemailer') ? ['Correo: revisa host y puerto SMTP, credenciales y conectividad; no incluyas contraseñas en los registros del incidente.'] : [])
    ];
    const pages = [
      { id: 'usuario', title: titles.usuario, markdown: `# ${titles.usuario}\n\nProyecto: **${name}**. Recorridos derivados de requisitos y pantallas aprobadas. Las funciones documentadas no acreditan ejecución.\n\n![Flujo principal por rol](assets/flujo.svg)\n\n${rolesMarkdown}\n\n## Glosario\n\n${bullets(['Rol: actor al que se asigna una función en los insumos aprobados.', 'Requisito funcional (RF): comportamiento acordado del proyecto.', 'Criterio de aceptación: condición aprobada para comprobar el resultado.', 'Mockup: diseño aprobado de una pantalla; sus capturas no prueban la aplicación.'])}\n\n## Preguntas frecuentes\n\n### ¿Qué funciones puedo utilizar?\n\nConsulta el recorrido de tu rol y los permisos aprobados.\n\n### ¿Qué hago si una pantalla no coincide?\n\nRegistra versión, requisito, pasos y resultado observado; comunica la incidencia al responsable.\n\n### ¿Cómo interpreto un video?\n\nLa ficha indica si procede de la aplicación ejecutándose o de un recorrido de mockups aprobados.\n` },
      { id: 'desarrollador', title: titles.desarrollador, markdown: `# ${titles.desarrollador}\n\n## Estructura del repositorio\n${fence(tree, 'text')}\n## Comandos declarados\n${fence(commands || '# Sin scripts declarados')}\n## Modelo de datos\n\n![Modelo simplificado](assets/datos.svg)\n\n${table(['Entidad', 'Campos', 'Fuente'], facts.models.map(model => [model.name, model.fields.join(', '), model.source]))}\n## API desde OpenAPI\n\n${endpoints}\n## Documentación original del repositorio\n\n${repository.filter(file => /\.md$/i.test(file.ruta)).map(file => `### ${md(file.ruta)}\n\n${file.contenido}\n`).join('\n')}\n## Licencia\n\nDecisión: **${license}**. Consulta LICENSE.md en la raíz de la entrega.\n` },
      { id: 'mantenimiento', title: titles.mantenimiento, markdown: `# ${titles.mantenimiento}\n\n## Servicios y salud\n\n${table(['Servicio', 'Compose', 'Puertos', 'Healthcheck'], compose)}\n## Configuración documentada\n\n${env}\n## Diagnóstico de esta entrega\n\n${bullets(diagnostics)}\n## Semillas y datos de demostración\n\n${bullets(facts.seeds)}\n${fence(facts.commands.filter(command => /seed|demo|migrat/.test(command.name)).map(command => command.run).join('\n') || '# No hay comandos de semillas declarados')}\nLas cuentas de demostración y sus valores deben consultarse en los archivos de semillas y en el entorno local de la entrega. No se publican contraseñas en los manuales ni en capturas.\n\n## Respaldo y recuperación\n\nIdentifica los volúmenes de cada servicio antes de actualizar. Define RPO, RTO y ubicación de las copias con el responsable. Verifica la restauración en un entorno separado.\n\n${bullets(facts.services.flatMap(service => service.volumes.map(volume => `${service.name}: ${typeof volume === 'object' ? JSON.stringify(volume) : volume}`)))}\n\n## Actualización e incidentes\n\n1. Registra versión y conserva un respaldo verificado.\n2. Revisa cambios de esquema y compatibilidad.\n3. Ejecuta los comandos de pruebas declarados en la guía de desarrollador.\n4. Documenta resultado y plan de reversión. No elimines volúmenes que contienen datos necesarios.\n` },
      { id: 'instalacion', title: titles.instalacion, markdown: `# ${titles.instalacion}\n\n## Servicios y puertos reales de la entrega\n\n${table(['Servicio', 'Archivo', 'Puertos', 'Healthcheck'], compose)}\n## Variables de los ejemplos de entorno\n\n${env}\n## Arranque\n${fence(facts.paths.includes('tools/preview-local.cjs') ? 'node tools/preview-local.cjs start\nnode tools/preview-local.cjs stop' : '# Consulta los comandos declarados por cada módulo\n' + commands)}\n${facts.services.length ? 'Docker y Docker Compose son necesarios para los servicios declarados. Utiliza los archivos .env.example para preparar la configuración local.' : 'No hay Compose aprobado en esta versión.'}\n\n## Construir este sitio y su PDF\n${fence('cd documentation\npython -m pip install -r requirements.txt\npython -m playwright install chromium\npython -m mkdocs serve\npython tools/export_pdf.py')}\nEl PDF se imprime desde site/print_page.html, construido por MkDocs a partir de estas mismas páginas.\n\n## Publicación opcional\n\n${opciones.githubActions ? 'El workflow valida y construye al cambiar documentation/** y también permite ejecución manual. Solo publica al elegir publicar en la ejecución manual o habilitar la variable de repositorio DOCUMENTATION_PUBLISH=true.' : 'Activa GitHub Actions al generar para incluir el workflow; generar y descargar no publica.'}\n` },
      { id: 'tecnica', title: titles.tecnica, markdown: `# ${titles.tecnica}\n\n## Arquitectura\n\n![Arquitectura de la entrega](assets/arquitectura.svg)\n\n## Módulos y pantallas\n\n![Mapa de módulos](assets/modulos.svg)\n\n## Requisitos no funcionales\n\n${bullets(requirements.filter(item => item.tipo === 'RNF').map(item => `${item.identificador}: ${item.nombre}. ${item.metrica_medible || item.descripcion || ''}`))}\n\n## Diagramas aprobados\n\n${diagrams.map((diagram, index) => {
        const mermaid = diagram.codigo_mermaid, ext = mermaid ? 'mmd' : 'puml';
        addDoc(`docs/assets/diagram-${index + 1}.${ext}`, mermaid || diagram.codigo_plantuml || '');
        return `### ${md(diagram.titulo || diagram.tipo)} · v${diagram.version || 1}\n\n![${md(diagram.titulo || diagram.tipo)}](assets/diagram-${index + 1}.svg)\n\n[Fuente editable](assets/diagram-${index + 1}.${ext})\n\n${mermaid ? fence(mermaid, 'mermaid') : ''}`;
      }).join('\n')}\n\n## Versiones de origen\n\n${table(['Artefacto', 'Versión', 'Verificación'], artifacts.map(item => [item.tipo, item.version, item.verificacion?.estado || 'Sin evidencia']))}\n` }
    ];
    for (const page of pages) addDoc(`docs/${page.id}.md`, page.markdown);
    addDoc('docs/index.md', `# ${name}\n\n${md(proyecto.descripcion || '')}\n\n## Manuales\n\n${pages.map(page => `- [${page.title}](${page.id}.md)`).join('\n')}\n\n## Estado de la documentación\n\n${bullets(warnings.length ? warnings : ['Fuentes aprobadas procesadas. Revisa las evidencias de ejecución antes de entregar.'])}\n`);
    for (const image of buildInfographics(flows, screens, facts)) add(image.ruta, image.contenido);
    addDoc('mkdocs.yml', `site_name: ${JSON.stringify(name)}\nuse_directory_urls: false\ntheme:\n  name: material\n  language: es\n  font: false\n  features: [navigation.tabs, navigation.top, search.suggest, search.highlight, content.code.copy, content.tabs.link]\n  palette:\n    - scheme: default\n      primary: deep purple\n      toggle: {icon: material/weather-night, name: Modo oscuro}\n    - scheme: slate\n      primary: deep purple\n      toggle: {icon: material/weather-sunny, name: Modo claro}\nplugins:\n  - search\n  - print-site:\n      add_to_navigation: false\n      add_cover_page: false\n      toc_title: Índice de contenidos\n      print_page_title: Documento completo\nmarkdown_extensions:\n  - tables\n  - admonition\n  - attr_list\n  - pymdownx.tabbed:\n      alternate_style: true\n  - pymdownx.superfences:\n      custom_fences:\n        - name: mermaid\n          class: mermaid\n          format: !!python/name:pymdownx.superfences.fence_code_format\nnav:\n  - Inicio: index.md\n${pages.map(page => `  - ${JSON.stringify(page.title)}: ${page.id}.md`).join('\n')}\nextra_css:\n  - assets/documentation.css\n`);
    addDoc('docs/assets/documentation.css', template('documentation.css') + '\n@page { @bottom-right { content: none; } @bottom-left { content: none; } }\n@media print { .md-header,.md-sidebar,.md-footer,.md-tabs {display:none!important} .md-main__inner {margin:0} .md-content {margin:0} img,svg {max-width:100%;max-height:240mm;object-fit:contain} pre,td {overflow-wrap:anywhere;white-space:pre-wrap} h1,h2,h3 {break-after:avoid} tr,figure {break-inside:avoid} }\n');
    addDoc('requirements.txt', template('requirements.txt'));
    addDoc('tools/export_pdf.py', template('export_pdf.py'));
    addDoc('tools/check_links.py', template('check_links.py'));
    if (opciones.githubActions) add('.github/workflows/documentation.yml', template('workflow.yml'));
    const original = filename => repository.find(file => file.ruta === filename)?.contenido || '';
    const append = (filename, content) => add(filename, original(filename) ? original(filename) + '\n\n---\n\n' + content : content);
    append('README.md', `# ${name}: entrega documentada\n\n[Manuales](documentation/docs/index.md) · [Arquitectura](ARCHITECTURE.md) · [Contribuir](CONTRIBUTING.md)\n\n## Ejecutar\n${fence(commands || '# Comandos pendientes de declarar')}\n## Estructura\n${fence(tree, 'text')}`);
    append('CONTRIBUTING.md', '# Contribuir\n\n1. Crea una rama y vincula cada cambio con su requisito aprobado.\n2. No agregues datos personales, secretos ni archivos .env.\n3. Ejecuta los comandos de pruebas declarados:\n' + fence(facts.commands.filter(command => /test|lint|check/.test(command.name)).map(command => command.run).join('\n') || '# No hay scripts de pruebas declarados') + '\n4. Valida documentación con `python tools/check_links.py` y `python -m mkdocs build --strict` desde documentation/.\n5. Solicita revisión antes de integrar.\n');
    append('ARCHITECTURE.md', `# Arquitectura de ${name}\n\n![Servicios](documentation/docs/assets/arquitectura.svg)\n\n${table(['Servicio', 'Fuente', 'Puertos', 'Salud'], compose)}\n## Modelo de datos\n\n${table(['Entidad', 'Campos'], facts.models.map(model => [model.name, model.fields.join(', ')]))}\n## Endpoints desde OpenAPI\n\n${endpoints}`);
    append('CHANGELOG.md', '# Historial de la entrega\n\n## Documentación generada\n\n' + bullets(artifacts.map(item => `${item.tipo}: versión ${item.version}`)) + '\n\nLas versiones de origen se registran en documentation/documentation-manifest.json. Este historial no inventa cambios de implementación.\n');
    add('LICENSE.md', licenseText);
    if (existingLicense && /^licen[cs]e(?:\.txt)?$/i.test(existingLicense.ruta)) add(existingLicense.ruta, licenseText);
    const manifest = { version: 3, proyecto: name, licencia: license, titular: holder, categorias: pages.map(({ id, title }) => ({ id, title })), fuentes: { requisitos: requirements.map(item => item.identificador), artefactos: artifacts.map(item => ({ tipo: item.tipo, version: item.version })), pantallas: screens.map(screen => screen.pantalla_id || screen.nombre_pantalla), diagramas: diagrams.map(item => ({ tipo: item.tipo, version: item.version })) }, advertencias: warnings };
    manifest.archivos = files.map(file => ({ ruta: file.ruta, sha256: crypto.createHash('sha256').update(file.contenido).digest('hex') }));
    addDoc('documentation-manifest.json', JSON.stringify(manifest, null, 2));
    const parser = new MarkdownIt({ html: false, linkify: true });
    const css = template('documentation.css');
    const render = page => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main class="markdown-body">${parser.render(page.markdown)}</main></body></html>`;
    return { archivos: files, paginas: pages.map(page => ({ ...page, html: render(page) })), categorias: manifest.categorias, flujos: flows, advertencias: warnings, videos: buildTutorials(flows, name).filter(video => video.roleId !== 'mantenimiento-documentacion'), diagramas: diagrams, pantallas: screens, hechos: facts, manifiesto: manifest, informe: { proyecto, requerimientos: requirements, modelo: diseno?.modelo_datos || null, decisiones: decisions }, proyecto: { nombre: name, descripcion: proyecto.descripcion || '' } };
  }
}
module.exports = ProjectDocumentationGenerator;
