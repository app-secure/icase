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

/**
 * Una aplicación por plataforma, nunca por rol: «Aplicación Web Vendedor» + «Aplicación Web Administrador» duplica el
 * inicio de sesión, los listados y los formularios (y sus mockups y rutas). Se unen en una sola aplicación de esa
 * plataforma, se fusionan los módulos con el mismo nombre y se quitan las pantallas repetidas. La visibilidad por rol
 * la deciden después los actores de cada RF.
 */
function mergeSamePlatformApps(codigo) {
  const lines = String(codigo || '').split(/\r?\n/);
  const nodeIndexes = lines.map((line, index) => (/^\*+\s*\S/.test(line) ? index : -1)).filter((index) => index >= 0);
  if (!nodeIndexes.length) return { codigo, unidas: [] };
  const root = { level: 0, name: '', children: [] };
  const stack = [root];
  for (const index of nodeIndexes) {
    const [, stars, name] = /^(\*+)\s*(.+?)\s*$/.exec(lines[index]);
    const node = { level: stars.length, name, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= node.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  const system = root.children.length === 1 ? root.children[0] : root;
  const unidas = [];
  const merged = [];
  const byPlatform = new Map();
  for (const app of system.children) {
    const platform = PlatformPolicy.marked(app.name);
    if (!['móvil', 'web'].includes(platform)) { merged.push(app); continue; }
    if (!byPlatform.has(platform)) { byPlatform.set(platform, app); merged.push(app); continue; }
    const target = byPlatform.get(platform);
    unidas.push(app.name);
    target.name = platform === 'web' ? 'Aplicación Web' : 'Aplicación Móvil';
    for (const module of app.children) {
      const same = target.children.find((item) => strip(item.name) === strip(module.name));
      if (!same) { target.children.push(module); continue; }
      for (const screen of module.children) {
        if (!same.children.some((item) => strip(item.name) === strip(screen.name))) same.children.push(screen);
      }
    }
  }
  // «Módulo de Vendedor» / «Módulo de Administrador» que agrupan módulos (Ventas, Clientes…) repiten las mismas
  // pantallas por rol y bajan las pantallas a un quinto nivel: se aplanan en la aplicación y se fusionan.
  const ROLE_GROUP = /^(?:modulo|panel|area|menu|seccion|portal)\s+(?:del?|para(?:\s+el|\s+la)?)\s+\S+/;
  const mergeInto = (target, module) => {
    const same = target.children.find((item) => strip(item.name) === strip(module.name));
    if (!same) { target.children.push(module); return; }
    for (const child of module.children) {
      if (child.children.length) mergeInto(same, child);
      else if (!same.children.some((item) => strip(item.name) === strip(child.name))) same.children.push(child);
    }
  };
  for (const app of merged) {
    const groups = app.children.filter((module) => ROLE_GROUP.test(strip(module.name)) && module.children.some((child) => child.children.length));
    if (!groups.length) continue;
    const rest = app.children.filter((module) => !groups.includes(module));
    app.children = [];
    for (const module of rest) mergeInto(app, module);
    for (const group of groups) {
      unidas.push(group.name);
      for (const module of group.children) mergeInto(app, module.children.length ? module : { ...module, children: [] });
    }
  }
  if (!unidas.length) return { codigo, unidas };
  system.children = merged;
  const out = [];
  const write = (node, level) => { out.push(`${'*'.repeat(level)} ${node.name}`); node.children.forEach((child) => write(child, level + 1)); };
  if (system === root) root.children.forEach((child) => write(child, 1)); else write(system, 1);
  const first = nodeIndexes[0];
  const last = nodeIndexes[nodeIndexes.length - 1];
  return { codigo: [...lines.slice(0, first), ...out, ...lines.slice(last + 1)].join('\n'), unidas };
}

/**
 * Quita pantallas de cuenta que ningún RF aprobado pide (recuperar contraseña, registro abierto, perfil): el prompt ya
 * lo prohíbe, pero si el modelo las añade generan mockups, rutas y botones sin operación detrás.
 */
const UNREQUESTED = [
  [/^(?:recuperacion|restablecimiento|cambio|olvido)\s+de\s+(?:la\s+)?contrasena/, /contrasena\b.*\b(?:recuper|restablec|olvid|cambi)|(?:recuper|restablec|olvid|cambi)\w*\b.*\bcontrasena/],
  [/^(?:registro|creacion)\s+de\s+cuenta|^registrarse$|^crear cuenta$/, /registr\w*\s+(?:de\s+)?(?:su\s+)?cuenta|autoregistro|crear\s+(?:su\s+)?cuenta/],
  [/^(?:perfil(?:\s+de(?:l)?\s+usuario)?|mi perfil|mi cuenta)$/, /\bperfil\b|mi cuenta/]
];
function removeUnrequested(codigo, textoRequisitos) {
  const requisitos = strip(textoRequisitos);
  const quitadas = [];
  const lines = String(codigo || '').split(/\r?\n/).filter((line) => {
    const match = /^(\*{3,})\s*(.+?)\s*$/.exec(line);
    if (!match) return true;
    const name = strip(match[2]);
    const rule = UNREQUESTED.find(([screen, need]) => screen.test(name) && !need.test(requisitos));
    if (rule) quitadas.push(match[2]);
    return !rule;
  });
  // Un módulo que se queda vacío («Configuración» con solo «Perfil de usuario») tampoco es navegable.
  const out = lines.filter((line, index) => {
    const match = /^(\*+)\s/.exec(line);
    if (!match || match[1].length < 3) return true;
    const next = lines.slice(index + 1).find((item) => /^\*+\s/.test(item));
    const nextLevel = next ? /^(\*+)/.exec(next)[1].length : 0;
    const wasParent = String(codigo).includes(`${line}\n${'*'.repeat(match[1].length + 1)} `) || String(codigo).includes(`${line}\r\n${'*'.repeat(match[1].length + 1)} `);
    return !(wasParent && nextLevel <= match[1].length);
  });
  return { codigo: out.join('\n'), quitadas };
}

module.exports = { review, parse, mergeSamePlatformApps, removeUnrequested };
