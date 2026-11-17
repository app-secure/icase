const { parse } = require('parse5');
const { formOf, rootOf } = require('./HtmlFormOwnership');
const { systemManaged } = require('./MockupFieldPolicy');

const VERBS = { consultar: 'GET', crear: 'POST', editar: 'PATCH', eliminar: 'DELETE' };
const WRITE_VERBS = new Set(['crear', 'editar']);
const BLOCKED_TAGS = new Set(['script', 'style', 'template', 'nav', 'aside', 'footer']);
const NON_FIELD_TYPES = new Set(['submit', 'button', 'reset']);
const ACTION = /^(RF-\d+)\.([a-z]+)$/i;

const attr = (node, name) => node?.attrs?.find((item) => item.name === name)?.value || '';
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
const label = (node) => (attr(node, 'aria-label') || textOf(node) || attr(node, 'value') || attr(node, 'title'))
  .replace(/\s+/g, ' ').trim().slice(0, 60) || node.tagName;

const isButton = (node) => node.tagName === 'button' || attr(node, 'role') === 'button'
  || (node.tagName === 'input' && NON_FIELD_TYPES.has(typeOf(node)));

/**
 * Comprueba los enlaces `data-accion="RF-xx.verbo"` que el modelo declara en un mockup.
 * Es determinista: no cablea nada ni inventa conexiones; solo informa qué enlaces son válidos
 * y qué controles quedaron sin enlace. Las advertencias no bloquean la aprobación.
 */
class MockupBindingValidator {
  validar({ html, requerimientos = [], contrato = null, identidad = null } = {}) {
    if (!html || typeof html !== 'string') return { enlaces: [], advertencias: [] };
    const document = parse(html);
    const root = descendants(document, (node) => node.tagName === 'main')[0]
      || descendants(document, (node) => node.tagName === 'body')[0] || document;
    // Un RF marcado explícitamente como no aprobado no es destino; los que no traen la marca (requisitos locales) sí.
    const rfs = new Set(requerimientos.filter((item) => item.identificador && item.tipo !== 'RNF' && item.aprobado !== false).map((item) => String(item.identificador).toUpperCase()));
    const operations = new Map((contrato?.operations || []).map((operation) => [String(operation.id).toUpperCase(), operation]));
    // RF de autenticación: no son destino de enlaces de datos (el acceso lo resuelve la sesión de la aplicación).
    const login = new Set([
      ...(identidad?.login || []).map((id) => String(id).toUpperCase()),
      ...(contrato?.identity?.login || []).map((id) => String(id).toUpperCase())
    ]);
    const enlaces = [];
    const advertencias = [];

    const controls = descendants(root, (item) => isButton(item) || attr(item, 'data-accion'));
    for (const node of controls) {
      const declared = attr(node, 'data-accion').trim();
      // Formulario y submit pueden declarar la misma operación. Se revisa una vez
      // por botón, sin crear otra acción cuyo nombre sea todo el texto del form.
      if (node.tagName === 'form' && declared && controls.some(item => isButton(item)
        && this._formOf(item) === node && attr(item, 'data-accion').trim().toLowerCase() === declared.toLowerCase())) continue;
      const control = this._controlLabel(node);
      if (!declared) {
        advertencias.push(`sin enlace: ${control}`);
        continue;
      }
      if (declared.toLowerCase() === 'ui') {
        enlaces.push({ control, rf: null, verbo: null, estado: 'ui', campos: [], campos_desconocidos: [] });
        continue;
      }
      enlaces.push({
        ...this._enlace({ node, control, declared, rfs, operations, login, advertencias }),
        tipo_control: node.tagName,
        control_id: attr(node, 'id'),
        formulario_id: attr(this._formOf(node), 'id'),
        edicion_id: attr(node, 'data-icase-edit-id'),
        formulario_edicion_id: attr(this._formOf(node), 'data-icase-edit-id')
      });
    }
    return { enlaces, advertencias };
  }

  _controlLabel(node) {
    if (node.tagName !== 'form') return label(node);
    const explicit = attr(node, 'aria-label') || attr(node, 'title');
    if (explicit) return explicit.trim().slice(0, 60);
    const legend = descendants(node, item => item.tagName === 'legend')[0];
    if (legend && textOf(legend).trim()) return label(legend);
    const submit = descendants(node, item => isButton(item) && (
      attr(item, 'data-accion').toLowerCase() === attr(node, 'data-accion').toLowerCase()
      || typeOf(item) === 'submit' || (item.tagName === 'button' && !typeOf(item))))[0];
    return submit ? label(submit) : `Formulario ${attr(node, 'data-accion')}`;
  }

  _enlace({ node, control, declared, rfs, operations, login, advertencias }) {
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
    if (login.has(rf)) return invalid(`${rf} es de autenticación: la resuelve la sesión de la aplicación, no un registro de datos; usa data-accion="ui"`, rf, verbo);

    const operation = operations.get(rf);
    if (operation?.methods && !operation.methods.includes(VERBS[verbo])) {
      return invalid(`${rf} no admite ${VERBS[verbo]}`, rf, verbo);
    }
    const campos = WRITE_VERBS.has(verbo) ? this._fields(node) : [];
    const properties = operation?.schema?.properties;
    const known = properties && Object.keys(properties).length ? new Set(Object.keys(properties)) : null;
    const campos_desconocidos = known ? campos.filter((name) => !known.has(name)) : [];
    for (const name of campos_desconocidos) advertencias.push(`campo "${name}" de "${control}" no existe en la operación ${rf}`);
    // Un formulario que crea registros sin control para algún campo de la operación no podrá guardarlos si el backend lo exige.
    const campos_faltantes = known && verbo === 'crear'
      ? Object.entries(properties).filter(([name, definition]) => !definition?.readOnly && !campos.includes(name)).map(([name]) => name) : [];
    // Solo se avisa de lo que la persona debería poder escribir: lo que completa el sistema (cliente de la sesión, estado
    // inicial, códigos generados, fechas de registro, totales calculados) no se pide en el formulario.
    const campos_a_avisar = campos_faltantes.filter((name) => !systemManaged(name, properties[name]));
    if (campos_a_avisar.length) advertencias.push(`el formulario de "${control}" no tiene control para: ${campos_a_avisar.join(', ')} (${rf} los guarda y el backend puede exigirlos)`);
    return { control, rf, verbo, estado: 'valido', campos, campos_desconocidos, campos_faltantes, en_formulario: Boolean(this._formOf(node)) };
  }

  _formOf(node) {
    return formOf(node);
  }

  /** Solo campos asociados a este formulario; un filtro externo nunca forma parte de un pago. */
  _fields(node) {
    const form = this._formOf(node);
    if (!form) return [];
    const names = descendants(rootOf(node), (item) => ['input', 'select', 'textarea'].includes(item.tagName)
      && !NON_FIELD_TYPES.has(typeOf(item)) && attr(item, 'name') && this._formOf(item) === form).map((item) => attr(item, 'name'));
    return [...new Set(names)];
  }
}

module.exports = MockupBindingValidator;
