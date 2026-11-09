const { parse } = require('parse5');

const VERBS = { consultar: 'GET', crear: 'POST', editar: 'PATCH', eliminar: 'DELETE' };
const WRITE_VERBS = new Set(['crear', 'editar']);
const BLOCKED_TAGS = new Set(['script', 'style', 'template', 'nav', 'aside', 'footer']);
const NON_FIELD_TYPES = new Set(['submit', 'button', 'reset']);
const ACTION = /^(RF-\d+)\.([a-z]+)$/i;

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value || '';
const typeOf = (node) => attr(node, 'type').toLowerCase();
const isHidden = (node) => node.attrs?.some((item) => item.name === 'hidden' || (item.name === 'aria-hidden' && item.value === 'true'))
  || attr(node, 'class').split(/\s+/).includes('hidden')
  || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(node, 'style'))
  || (node.tagName === 'input' && typeOf(node) === 'hidden');

function descendants(node, predicate) {
  if (BLOCKED_TAGS.has(node.tagName) || isHidden(node)) return [];
  return [...(predicate(node) ? [node] : []), ...(node.childNodes || []).flatMap((child) => descendants(child, predicate))];
}
function textOf(node) {
  if (BLOCKED_TAGS.has(node.tagName) || isHidden(node)) return '';
  return node.nodeName === '#text' ? node.value : (node.childNodes || []).map(textOf).join(' ');
}
const label = (node) => (textOf(node) || attr(node, 'aria-label') || attr(node, 'value') || attr(node, 'title'))
  .replace(/\s+/g, ' ').trim().slice(0, 60) || node.tagName;

const isButton = (node) => node.tagName === 'button' || attr(node, 'role') === 'button'
  || (node.tagName === 'input' && NON_FIELD_TYPES.has(typeOf(node)));

/**
 * Comprueba los enlaces `data-accion="RF-xx.verbo"` que el modelo declara en un mockup.
 * Es determinista: no cablea nada ni inventa conexiones; solo informa qué enlaces son válidos
 * y qué controles quedaron sin enlace. Las advertencias no bloquean la aprobación.
 */
class MockupBindingValidator {
  validar({ html, requerimientos = [], contrato = null } = {}) {
    if (!html || typeof html !== 'string') return { enlaces: [], advertencias: [] };
    const document = parse(html);
    const root = descendants(document, (node) => node.tagName === 'main')[0]
      || descendants(document, (node) => node.tagName === 'body')[0] || document;
    // Un RF marcado explícitamente como no aprobado no es destino; los que no traen la marca (requisitos locales) sí.
    const rfs = new Set(requerimientos.filter((item) => item.identificador && item.tipo !== 'RNF' && item.aprobado !== false).map((item) => String(item.identificador).toUpperCase()));
    const operations = new Map((contrato?.operations || []).map((operation) => [String(operation.id).toUpperCase(), operation]));
    const enlaces = [];
    const advertencias = [];

    for (const node of descendants(root, (item) => isButton(item) || attr(item, 'data-accion'))) {
      const declared = attr(node, 'data-accion').trim();
      const control = label(node);
      if (!declared) {
        advertencias.push(`sin enlace: ${control}`);
        continue;
      }
      if (declared.toLowerCase() === 'ui') {
        enlaces.push({ control, rf: null, verbo: null, estado: 'ui', campos: [], campos_desconocidos: [] });
        continue;
      }
      enlaces.push(this._enlace({ node, control, declared, rfs, operations, advertencias }));
    }
    return { enlaces, advertencias };
  }

  _enlace({ node, control, declared, rfs, operations, advertencias }) {
    const invalid = (motivo, rf = null, verbo = null) => {
      advertencias.push(`enlace inválido "${control}": ${motivo}`);
      return { control, rf, verbo, estado: 'invalido', motivo, campos: [], campos_desconocidos: [] };
    };
    const match = ACTION.exec(declared);
    if (!match) return invalid(`formato "${declared}" no válido, se espera RF-xx.verbo`);
    const rf = match[1].toUpperCase();
    const verbo = match[2].toLowerCase();
    if (!VERBS[verbo]) return invalid(`verbo "${match[2]}" no válido (consultar, crear, editar o eliminar)`, rf);
    if (!rfs.has(rf)) return invalid(`${rf} no es un RF aprobado`, rf, verbo);

    const operation = operations.get(rf);
    if (operation?.methods && !operation.methods.includes(VERBS[verbo])) {
      return invalid(`${rf} no admite ${VERBS[verbo]}`, rf, verbo);
    }
    const campos = WRITE_VERBS.has(verbo) ? this._fields(node) : [];
    const properties = operation?.schema?.properties;
    const known = properties && Object.keys(properties).length ? new Set(Object.keys(properties)) : null;
    const campos_desconocidos = known ? campos.filter((name) => !known.has(name)) : [];
    for (const name of campos_desconocidos) advertencias.push(`campo "${name}" de "${control}" no existe en la operación ${rf}`);
    return { control, rf, verbo, estado: 'valido', campos, campos_desconocidos };
  }

  /** Campos con `name` del formulario del control; sin formulario, los de toda la pantalla. */
  _fields(node) {
    let scope = node.parentNode;
    while (scope && scope.tagName !== 'form') scope = scope.parentNode;
    scope = scope || this._rootOf(node);
    const names = descendants(scope, (item) => ['input', 'select', 'textarea'].includes(item.tagName)
      && !NON_FIELD_TYPES.has(typeOf(item)) && attr(item, 'name')).map((item) => attr(item, 'name'));
    return [...new Set(names)];
  }

  _rootOf(node) {
    let current = node;
    while (current.parentNode && current.tagName !== 'main') current = current.parentNode;
    return current;
  }
}

module.exports = MockupBindingValidator;
