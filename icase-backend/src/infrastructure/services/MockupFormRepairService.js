const { parse } = require('parse5');
const { formOf } = require('./HtmlFormOwnership');

const attr = (node, name) => node?.attrs?.find(a => a.name === name)?.value || '';
const walk = node => [node, ...(node.childNodes || []).flatMap(walk)];
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const editId = 'data-icase-edit-id';
const isControl = node => node.tagName === 'form' || node.tagName === 'button' || attr(node, 'data-accion')
  || attr(node, 'role') === 'button' || (node.tagName === 'input' && /^(submit|button|reset)$/i.test(attr(node, 'type')));

function applyEdits(html, edits) {
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let limit = html.length;
  for (const edit of ordered) {
    if (edit.end > limit || edit.start > edit.end) throw new Error('Los cambios de formulario se superponen.');
    html = html.slice(0, edit.start) + edit.text + html.slice(edit.end);
    limit = edit.start;
  }
  return html;
}

/** Ediciones locales a partir del contrato; no inventa operaciones ni reescribe la pantalla. */
class MockupFormRepairService {
  preparar(mockup) {
    const html = String(mockup.preview_code || '');
    const nodes = walk(parse(html, { sourceCodeLocationInfo: true })).filter(isControl);
    const used = new Set(nodes.map(n => attr(n, editId)).filter(Boolean));
    const seen = new Set();
    const edits = [];
    let counter = 0;
    for (const node of nodes) {
      const location = node.sourceCodeLocation;
      if (!location?.startTag) continue;
      const existing = attr(node, editId);
      if (existing && !seen.has(existing)) { seen.add(existing); continue; }
      let id;
      do { id = `icase-${++counter}`; } while (used.has(id));
      used.add(id);
      const oldAttr = location.attrs?.[editId];
      const end = location.startTag.endOffset - (html[location.startTag.endOffset - 2] === '/' ? 2 : 1);
      edits.push({ start: oldAttr?.startOffset ?? end, end: oldAttr?.endOffset ?? end, text: `${oldAttr ? '' : ' '}${editId}="${id}"` });
    }
    return { ...mockup, preview_code: applyEdits(html, edits) };
  }

  esPeticionDeCampos(instruccion, objetivos, advertenciasPrevias = []) {
    if (!objetivos.length || objetivos.some(o => o.tipo !== 'campo_faltante')) return false;
    let text = normalize(instruccion);
    // Una advertencia copiada antes de recalcular el diagnóstico puede haber desaparecido:
    // por ejemplo, un filtro que antes se atribuía erróneamente a todos los botones de crear.
    for (const message of advertenciasPrevias) {
      if (/^campo "[^"]+" de "[^"]+" no existe en la operación RF-\d+$/.test(message)) {
        const rf = message.match(/RF-\d+$/)[0];
        if (objetivos.some(o => o.rf === rf)) text = text.split(normalize(message)).join(' ');
      }
    }
    for (const o of objetivos) {
      for (const value of [o.mensaje, o.campo, o.control, o.rf].filter(Boolean)) text = text.split(normalize(value)).join(' ');
    }
    // Limpiar encabezados y plantillas literales copiadas desde el panel de advertencias.
    text = text
      .replace(/\baspectos que conviene revisar\b/g, ' ')
      .replace(/\bproblemas que impiden validar esta pantalla\b/g, ' ')
      .replace(/\bel formulario de "[^"]*" no tiene control para\b/g, ' ')
      .replace(/\b(?:rf-\d+\s+)?los guarda y el backend puede exigirlos\b/g, ' ')
      .replace(/\bcampo "[^"]+" de "[^"]+" no existe en la operacion rf-\d+\b/g, ' ');
    const allowed = new Set('corrige corregir corrigelos corregirlos repara reparar reparalos repararlos arregla arreglar arreglalos arreglarlos soluciona solucionar solucionalos solucionarlos resuelve resolver resolverlos resuelvelo revisa revisar revision revisen completa completar completalos completarlos agrega agregar anade anadir incluye incluir coloca colocar aplica aplicar necesito quiero puedes ayuda ayudame porfa actual vista seleccionada aqui ahora solo faltan falta omiten omitidos estos estas este esta esos esas ese esa los las el la lo esto eso aspectos aspecto por para a analizar advertencias advertencia errores error problemas problema impiden validar validacion faltantes faltante campos campo controles control de del pantalla formulario formularios pendientes pendiente indicados indicadas todos todas todo toda bien favor y en que me salen siguientes siguiente conviene mis sus un una unos unas'.split(' '));
    const words = text.match(/[a-z0-9_]+/g) || [];
    return Boolean(String(instruccion).trim()) && words.every(word => allowed.has(word));
  }

  reparar({ mockup, instruccion, objetivos, diagnostico, contrato }) {
    if (!this.esPeticionDeCampos(instruccion, objetivos, mockup.advertencias_validacion)) return null;
    const html = mockup.preview_code;
    const nodes = walk(parse(html, { sourceCodeLocationInfo: true }));
    const byId = new Map(nodes.filter(n => attr(n, editId)).map(n => [attr(n, editId), n]));
    const operations = new Map((contrato?.operations || []).map(op => [op.id, op]));
    const forms = new Map();
    const newForms = new Map();
    for (const objetivo of objetivos) {
      const enlace = diagnostico.enlazado.enlaces[objetivo.enlace_index];
      const control = byId.get(enlace?.edicion_id);
      const form = formOf(control);
      const operation = operations.get(enlace?.rf);
      const definition = operation?.schema?.properties?.[objetivo.campo];
      if (!control || !definition || definition.readOnly
        || enlace.estado !== 'valido' || enlace.verbo !== 'crear') return null;
      if (!form) {
        if (!['button', 'input'].includes(control.tagName)) return null;
        if (!newForms.has(enlace.rf)) newForms.set(enlace.rf, { operation, fields: new Map(), controls: new Set() });
        const group = newForms.get(enlace.rf);
        group.fields.set(objetivo.campo, { definition, required: operation.schema.required?.includes(objetivo.campo) });
        group.controls.add(control);
        continue;
      }
      if (!form.sourceCodeLocation?.endTag) return null;
      if (!forms.has(form)) forms.set(form, new Map());
      forms.get(form).set(objetivo.campo, { definition, required: operation.schema.required?.includes(objetivo.campo) });
    }

    const edits = [];
    for (const [form, fields] of forms) {
      const descendants = nodes.filter(n => formOf(n) === form);
      const blocks = [];
      for (const [name, { definition, required }] of fields) {
        const previous = descendants.filter(n => ['input', 'select', 'textarea'].includes(n.tagName) && attr(n, 'name') === name);
        const value = attr(previous[0], 'value');
        // No dejar dos controles con el mismo name enviando valores diferentes.
        for (const node of previous) {
          const loc = node.sourceCodeLocation;
          if (!loc) return null;
          edits.push({ start: loc.startOffset, end: loc.endOffset, text: '' });
        }
        const control = this._control(name, definition, value, required);
        if (!control) return null;
        blocks.push(control);
      }
      const block = `<div class="grid w-full min-w-0 basis-full grid-cols-1 gap-3 my-3">${blocks.join('')}</div>`;
      const insertion = form.sourceCodeLocation.endTag.startOffset;
      edits.push({ start: insertion, end: insertion, text: block });
      // Las tarjetas que usan flex necesitan permitir que los campos ocupen otra fila.
      if (/(?:^|\s)(?:inline-)?flex(?:\s|$)/.test(attr(form, 'class')) || /display\s*:\s*(?:inline-)?flex/i.test(attr(form, 'style'))) {
        const style = form.sourceCodeLocation.attrs?.style;
        const end = form.sourceCodeLocation.startTag.endOffset - 1;
        const currentStyle = attr(form, 'style').trim().replace(/;+$/, '');
        edits.push({ start: style?.startOffset ?? end, end: style?.endOffset ?? end,
          text: `${style ? '' : ' '}style="${currentStyle ? `${escape(currentStyle)};` : ''}flex-wrap:wrap;gap:0.75rem"` });
      }
    }
    if (newForms.size) {
      const destination = nodes.find(n => n.tagName === 'main') || nodes.find(n => n.tagName === 'body');
      if (!destination?.sourceCodeLocation?.endTag || formOf(destination)) return null;
      const ids = new Set(nodes.map(n => attr(n, 'id')).filter(Boolean));
      const blocks = [];
      for (const [rf, group] of newForms) {
        let id = `icase-form-${rf.toLowerCase()}`;
        let suffix = 1;
        while (ids.has(id)) id = `icase-form-${rf.toLowerCase()}-${++suffix}`;
        ids.add(id);
        const fields = [...group.fields].map(([name, field]) => this._control(name, field.definition, '', field.required));
        if (fields.some(field => !field)) return null;
        const title = escape(group.operation.schema.title || group.operation.name || 'registro');
        blocks.push(`<form id="${id}" aria-label="Datos de ${title}" class="mt-4 w-full rounded-xl border border-slate-200 bg-white p-4"><h2 class="mb-3 text-base font-semibold">Datos de ${title}</h2><div class="grid grid-cols-1 gap-3 md:grid-cols-2">${fields.join('')}</div></form>`);
        for (const control of group.controls) {
          const location = control.sourceCodeLocation;
          if (!location?.startTag) return null;
          const previous = location.attrs?.form;
          const end = location.startTag.endOffset - (html[location.startTag.endOffset - 2] === '/' ? 2 : 1);
          edits.push({ start: previous?.startOffset ?? end, end: previous?.endOffset ?? end, text: `${previous ? '' : ' '}form="${id}"` });
        }
      }
      const insertion = destination.sourceCodeLocation.endTag.startOffset;
      edits.push({ start: insertion, end: insertion, text: blocks.join('') });
    }
    return { ...mockup, preview_code: applyEdits(html, edits) };
  }

  _control(name, definition, value, required) {
    if (['object', 'array'].includes(definition.type)) return null;
    const title = String(definition.title || name.replace(/_id$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '));
    const label = title.charAt(0).toUpperCase() + title.slice(1);
    const common = `name="${escape(name)}"${required ? ' required' : ''} class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"`;
    let control;
    if (definition.enum?.length || definition['x-references'] || name.endsWith('_id')) {
      const options = definition.enum?.length
        ? definition.enum.map(v => `<option value="${escape(v)}"${String(v) === value ? ' selected' : ''}>${escape(v)}</option>`).join('')
        : `<option value="">Selecciona ${escape(label.toLowerCase())}</option>${value ? `<option value="${escape(value)}" selected>Selección actual</option>` : ''}`;
      control = `<select ${common}>${options}</select>`;
    } else {
      if (definition.type === 'boolean') return null;
      const type = ['integer', 'number'].includes(definition.type) ? 'number'
        : definition.format === 'date-time' ? 'datetime-local' : definition.format === 'date' ? 'date' : 'text';
      const formatted = type === 'date' ? value.slice(0, 10) : type === 'datetime-local' ? value.slice(0, 16) : value;
      const limits = [
        type === 'number' ? `step="${definition.type === 'integer' ? '1' : 'any'}"` : '',
        Number.isFinite(definition.minimum) ? `min="${definition.minimum}"` : '',
        Number.isFinite(definition.maximum) ? `max="${definition.maximum}"` : ''
      ].filter(Boolean).join(' ');
      control = `<input type="${type}" ${common}${formatted ? ` value="${escape(formatted)}"` : ''}${limits ? ` ${limits}` : ''}>`;
    }
    return `<label class="block text-sm font-medium text-slate-700"><span class="mb-1 block">${escape(label)}</span>${control}</label>`;
  }
}

module.exports = MockupFormRepairService;
