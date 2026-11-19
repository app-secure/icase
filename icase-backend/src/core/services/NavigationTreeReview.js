const PlatformPolicy = require('./PlatformPolicy');

/**
 * Revisión de la estructura del árbol de navegación (WBS de PlantUML): cada pantalla debe colgar de una aplicación
 * (móvil o web) y cada aplicación debe tener su acceso. Son avisos: el modelo propone el árbol y la persona decide, pero
 * la plataforma de cada pantalla no puede depender de adivinar palabras sueltas.
 */
const LOGIN = /\b(?:inicio de sesion|iniciar sesion|login|autenticacion|acceso al sistema)\b/;
const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const label = (value) => `«${String(value).slice(0, 70)}»`;

function parse(codigo) {
  const nodes = [];
  const stack = [];
  for (const line of String(codigo || '').split(/\r?\n/)) {
    const match = /^(\*+)\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const level = match[1].length;
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const node = { level, name: match[2], parent: stack[stack.length - 1] || null, children: 0 };
    if (node.parent) node.parent.children += 1;
    stack.push(node);
    nodes.push(node);
  }
  return nodes;
}

/** Plataforma de un nodo: la de su rama (el ancestro más cercano que la nombra). */
function platformOf(node) {
  for (let current = node; current; current = current.parent) {
    const marked = PlatformPolicy.marked(current.name);
    if (marked) return marked;
  }
  return null;
}

// Un mensaje de resultado no es un destino de navegación: es la respuesta de la pantalla que ejecuta la acción.
const RESULT_NODE = /^(?:confirmacion|resultado|exito|exitosa?|operacion exitosa)\b/;

function review(codigo) {
  const nodes = parse(codigo);
  const warnings = [];
  const results = nodes.filter((node) => node.children === 0 && node.level >= 3 && RESULT_NODE.test(strip(node.name)));
  if (results.length) {
    const sample = results.slice(0, 4).map((node) => label(node.name)).join(', ');
    warnings.push(`${results.length} nodo(s) describen un mensaje de resultado, no una pantalla: ${sample}${results.length > 4 ? '…' : ''}. El resultado de una acción se muestra dentro de la pantalla que la ejecuta; quita esos nodos para no generar mockups sin función propia.`);
  }
  const roots = nodes.filter((node) => node.level === 2);
  const marked = nodes.some((node) => PlatformPolicy.marked(node.name));
  const metrics = { aplicaciones: 0, pantallas_sin_aplicacion: 0 };
  if (!nodes.length || !marked) return { advertencias: warnings, metricas: metrics };

  for (const node of nodes.filter((item) => PlatformPolicy.marked(item.name) === 'ambas')) {
    warnings.push(`El nodo ${label(node.name)} nombra dos plataformas; crea una aplicación por plataforma, cada una con su propio acceso.`);
  }

  const leaves = nodes.filter((node) => node.children === 0 && node.level >= 3);
  const orphan = leaves.filter((node) => !platformOf(node) || platformOf(node) === 'ambas');
  metrics.pantallas_sin_aplicacion = orphan.length;
  if (orphan.length) {
    const sample = orphan.slice(0, 4).map((node) => label(node.name)).join(', ');
    warnings.push(`${orphan.length} pantalla(s) no indican su aplicación (móvil o web): ${sample}${orphan.length > 4 ? '…' : ''}. El nivel 2 del árbol debe ser la aplicación (por ejemplo «Aplicación Móvil de Clientes» o «Aplicación Web Interna») y las pantallas deben colgar de ella.`);
  }

  // Aplicaciones: ramas de nivel 2 que nombran una plataforma.
  const apps = roots.filter((node) => ['móvil', 'web'].includes(PlatformPolicy.marked(node.name)));
  metrics.aplicaciones = apps.length;
  const hasLogin = (app) => leaves.some((leaf) => platformOf(leaf) && isUnder(leaf, app) && LOGIN.test(strip(leaf.name)));
  if (apps.some(hasLogin)) {
    for (const app of apps.filter((item) => !hasLogin(item) && leaves.some((leaf) => isUnder(leaf, item)))) {
      warnings.push(`La aplicación ${label(app.name)} no tiene pantalla de acceso; cada aplicación necesita su propio inicio de sesión.`);
    }
  }
  return { advertencias: warnings, metricas: metrics };
}

function isUnder(node, ancestor) {
  for (let current = node; current; current = current.parent) if (current === ancestor) return true;
  return false;
}

module.exports = { review, parse };
