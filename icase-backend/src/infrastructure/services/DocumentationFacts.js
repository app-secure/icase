const YAML = require('yaml');
const path = require('node:path');
const approved = item => item.aprobado === true && !item.desactualizado && !['rechazado', 'desactualizado'].includes(item.estado);
const safePath = value => typeof value === 'string' && value && !path.posix.isAbsolute(value) && !/^[a-z]:|\\|\0/i.test(value) && !value.split('/').includes('..');
const latestApproved = items => [...items.filter(approved).reduce((map, item) => {
  if (!map.has(item.tipo) || Number(item.version || 1) > Number(map.get(item.tipo).version || 1)) map.set(item.tipo, item);
  return map;
}, new Map()).values()];
const criterionText = value => {
  if (typeof value !== 'object' || value === null) return String(value ?? '');
  const description = value.descripcion || value.texto || [value.dado, value.cuando, value.entonces].filter(Boolean).join(' ');
  return description ? `${description}${value.necesidades_origen?.length ? ` (fuentes: ${value.necesidades_origen.join(', ')})` : ''}` : JSON.stringify(value);
};
function deliveryFacts(files = []) {
  const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
  const services = [], variables = [], commands = [], endpoints = [], models = [], packages = [];
  const warnings = [];
  for (const file of files.filter(file => safePath(file.ruta))) {
    const text = String(file.contenido || '');
    if (/(?:compose|docker-compose)[^/]*\.ya?ml$/i.test(file.ruta)) {
      try { for (const [name, service] of Object.entries(YAML.parse(text)?.services || {})) services.push({ name, source: file.ruta, image: service.image || service.build?.context || service.build || '', ports: list(service.ports), health: list(service.healthcheck?.test), depends: Array.isArray(service.depends_on) ? service.depends_on : Object.keys(service.depends_on || {}), volumes: list(service.volumes) }); }
      catch { warnings.push(`Compose inválido: ${file.ruta}`); }
    }
    if (/\.env\.example$/i.test(file.ruta)) for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) variables.push({ name: match[1], source: file.ruta, value: /PASS|SECRET|TOKEN|KEY|CREDENTIAL|URI|URL/i.test(match[1]) ? '(configurar en el entorno; no se publica el valor)' : match[2] });
    }
    if (/(?:^|\/)package\.json$/.test(file.ruta)) try {
      const pkg = JSON.parse(text), folder = path.posix.dirname(file.ruta);
      packages.push({ folder, dependencies: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }) });
      for (const [name, command] of Object.entries(pkg.scripts || {})) commands.push({ folder, name, command, run: `npm --prefix ${folder} run ${name}` });
    } catch { warnings.push(`package.json inválido: ${file.ruta}`); }
    if (/(?:^|\/)openapi\.json$/.test(file.ruta)) try {
      const api = JSON.parse(text);
      for (const [route, operations] of Object.entries(api.paths || {})) for (const [method, operation] of Object.entries(operations)) if (/^(get|post|put|patch|delete|head|options)$/.test(method)) endpoints.push({ method: method.toUpperCase(), route, description: operation.summary || operation.operationId || '', source: file.ruta });
      for (const [name, schema] of Object.entries(api.components?.schemas || {})) models.push({ name, fields: Object.keys(schema.properties || {}), source: file.ruta });
    } catch { warnings.push(`OpenAPI inválido: ${file.ruta}`); }
  }
  return { services, variables, commands, endpoints, models, packages, warnings, paths: files.map(file => file.ruta).filter(safePath), seeds: files.filter(file => /seed|demo|fixture/i.test(file.ruta)).map(file => file.ruta) };
}
module.exports = { approved, safePath, latestApproved, deliveryFacts, criterionText };
