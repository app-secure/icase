const { parse, serialize } = require('parse5');
const { formOf, rootOf } = require('./HtmlFormOwnership');
const { systemManaged } = require('./MockupFieldPolicy');

const VERBS = { consultar: 'GET', crear: 'POST', editar: 'PATCH', eliminar: 'DELETE' };
const WRITE_VERBS = new Set(['crear', 'editar']);
const BLOCKED_TAGS = new Set(['script', 'style', 'template', 'nav', 'aside', 'footer']);
const NON_FIELD_TYPES = new Set(['submit', 'button', 'reset']);
const ACTION = /^(RF-\d+)\.([a-z]+)$/i;
const UI_LABEL = /^(?:cancelar|cerrar|volver|regresar|limpiar|atr[aá]s)\b/;

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

  /**
   * Marca como «solo interfaz» (data-accion="ui") los botones sin enlace, sin IA ni tocar nada más del HTML.
   * Con `controles` solo se marcan los que tienen esa etiqueta. Devuelve el HTML nuevo y las etiquetas marcadas.
   */
  marcarSinEnlace(html, { controles = null, soloGrupos = false } = {}) {
    if (!html || typeof html !== 'string') return { html, marcados: [] };
    const document = parse(html, { sourceCodeLocationInfo: true });
    const root = descendants(document, (node) => node.tagName === 'main')[0]
      || descendants(document, (node) => node.tagName === 'body')[0] || document;
    const wanted = controles ? new Set(controles.map((item) => String(item).replace(/\s+/g, ' ').trim().toLowerCase())) : null;
    const nodes = descendants(root, (item) => isButton(item) && !attr(item, 'data-accion').trim())
      .filter((node) => node.sourceCodeLocation?.startTag && (!wanted || wanted.has(label(node).toLowerCase())));
    // Un grupo de botones hermanos sin operación (pestañas de estado, selector «Mesa / Silla») solo cambia la vista.
    const inGroup = (node) => {
      const siblings = (node.parentNode?.childNodes || []).filter((child) => child.tagName);
      return siblings.length >= 2 && siblings.every((child) => isButton(child) && ['', 'ui'].includes(attr(child, 'data-accion').trim().toLowerCase()));
    };
    if (soloGrupos) nodes.splice(0, nodes.length, ...nodes.filter(inGroup));
    let result = html;
    for (const node of nodes.sort((a, b) => b.sourceCodeLocation.startTag.startOffset - a.sourceCodeLocation.startTag.startOffset)) {
      const at = node.sourceCodeLocation.startTag.startOffset + 1 + node.tagName.length;
      result = `${result.slice(0, at)} data-accion="ui"${result.slice(at)}`;
    }
    return { html: result, marcados: nodes.map(label).reverse() };
  }

  /**
   * Enlaza los botones sin enlace a la operación que les corresponde, sin IA: el verbo sale del texto del botón y el requisito, de
   * los que trata la pantalla (`rfs`), eligiendo aquel cuyos campos coinciden más con los controles de su formulario.
   * Si no hay una elección clara el botón se deja como estaba. Devuelve el HTML, lo enlazado y lo que quedó sin resolver.
   */
  enlazarSinEnlace(html, { rfs = [], requerimientos = [], contrato = null, identidad = null } = {}) {
    if (!html || typeof html !== 'string') return { html, enlazados: [], pendientes: [] };
    const document = parse(html, { sourceCodeLocationInfo: true });
    const root = descendants(document, (node) => node.tagName === 'main')[0]
      || descendants(document, (node) => node.tagName === 'body')[0] || document;
    const approved = new Set(requerimientos.filter((item) => item.identificador && item.tipo !== 'RNF' && item.aprobado !== false).map((item) => String(item.identificador).toUpperCase()));
    const operations = new Map((contrato?.operations || []).map((operation) => [String(operation.id).toUpperCase(), operation]));
    const login = new Set([...(identidad?.login || []), ...(contrato?.identity?.login || [])].map((id) => String(id).toUpperCase()));
    const candidates = [...new Set((rfs || []).map((id) => String(id).trim().toUpperCase()))].filter((id) => approved.has(id) && !login.has(id));
    const verbOf = (text) => {
      const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (/elimin|borr|quitar|cancel/.test(plain)) return 'eliminar';
      if (/edit|actualiz|modific|reasign|cambiar/.test(plain)) return 'editar';
      if (/busc|consult|filtr|\bver\b|listar|validar/.test(plain)) return 'consultar';
      return 'crear';
    };
    const edits = [];
    const enlazados = [];
    const pendientes = [];
    for (const node of descendants(root, (item) => isButton(item) && !attr(item, 'data-accion').trim())) {
      const control = label(node);
      const verb = verbOf(control);
      const names = this._fields(node);
      const usable = candidates.filter((rf) => { const methods = operations.get(rf)?.methods; return !methods || methods.includes(VERBS[verb]); });
      const score = (rf) => {
        const properties = Object.keys(operations.get(rf)?.schema?.properties || {});
        return names.filter((name) => properties.includes(name)).length;
      };
      const ranked = usable.map((rf) => ({ rf, points: score(rf) })).sort((a, b) => b.points - a.points);
      const pick = usable.length === 1 ? ranked[0] : ranked[0] && ranked[0].points > 0 && (!ranked[1] || ranked[0].points > ranked[1].points) ? ranked[0] : null;
      if (!pick || !node.sourceCodeLocation?.startTag) { pendientes.push(control); continue; }
      edits.push({ at: node.sourceCodeLocation.startTag.startOffset + 1 + node.tagName.length, text: ` data-accion="${pick.rf}.${verb}"` });
      enlazados.push(`${control} → ${pick.rf}.${verb}`);
    }
    let result = html;
    for (const edit of edits.sort((a, b) => b.at - a.at)) result = `${result.slice(0, edit.at)}${edit.text}${result.slice(edit.at)}`;
    return { html: result, enlazados, pendientes };
  }

  /**
   * Un «Formulario de registro de cliente» cuyo <form> y botón de envío quedaron en data-accion="ui" (o sin enlace) no
   * guarda nada: es un botón muerto en la aplicación generada. Si la pantalla es de alta o edición, se liga el formulario
   * y su envío al RF cuya operación (con ese método) comparte más campos con el formulario; si hay empate, no se adivina.
   */
  enlazarFormularioPrincipal(html, { verbo, rfs = [], requerimientos = [], contrato = null, identidad = null } = {}) {
    if (!html || !['crear', 'editar'].includes(verbo)) return { html, enlazado: null };
    const document = parse(html);
    const root = descendants(document, (node) => node.tagName === 'main')[0] || document;
    const forms = descendants(root, (node) => node.tagName === 'form');
    const open = forms.filter((form) => { const value = attr(form, 'data-accion').trim().toLowerCase(); return !value || value === 'ui'; });
    if (forms.length !== 1 || open.length !== 1) return { html, enlazado: null };
    const [form] = open;
    const approved = new Set(requerimientos.filter((item) => item.identificador && item.tipo !== 'RNF' && item.aprobado !== false).map((item) => String(item.identificador).toUpperCase()));
    const operations = new Map((contrato?.operations || []).map((operation) => [String(operation.id).toUpperCase(), operation]));
    const login = new Set([...(identidad?.login || []), ...(contrato?.identity?.login || [])].map((id) => String(id).toUpperCase()));
    const names = descendants(form, (node) => ['input', 'select', 'textarea'].includes(node.tagName)).map((node) => attr(node, 'name')).filter(Boolean);
    const ranked = [...new Set(rfs.map((id) => String(id).trim().toUpperCase()))]
      .filter((id) => approved.has(id) && !login.has(id) && operations.has(id))
      .filter((id) => { const methods = operations.get(id).methods; return !methods || methods.includes(VERBS[verbo]); })
      .map((id) => ({ id, points: names.filter((name) => Object.keys(operations.get(id).schema?.properties || {}).includes(name)).length }))
      .filter((item) => item.points > 0)
      .sort((a, b) => b.points - a.points);
    if (!ranked.length || (ranked[1] && ranked[1].points === ranked[0].points)) return { html, enlazado: null };
    const value = `${ranked[0].id}.${verbo}`;
    const setAction = (node) => {
      const existing = node.attrs.find((item) => item.name === 'data-accion');
      if (existing) existing.value = value; else node.attrs.push({ name: 'data-accion', value });
    };
    setAction(form);
    const submit = descendants(form, (node) => isButton(node) && (typeOf(node) === 'submit' || (node.tagName === 'button' && !typeOf(node))))
      .find((node) => { const current = attr(node, 'data-accion').trim().toLowerCase(); return (!current || current === 'ui') && !UI_LABEL.test(label(node).toLowerCase()); });
    if (submit) setAction(submit);
    return { html: serialize(document), enlazado: value };
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
