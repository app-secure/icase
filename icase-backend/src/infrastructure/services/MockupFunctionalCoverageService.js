const { parse } = require('parse5');

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const words = value => normalize(value).match(/[a-z0-9]+/g) || [];
const singular = value => value.length > 4 && value.endsWith('s') ? value.slice(0, -1) : value;
const contains = (text, expected) => {
  const actual = new Set(words(text).map(singular));
  return words(expected).every(word => actual.has(singular(word)));
};
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value || '';
const actions = ['eliminar', 'cancelar', 'aprobar', 'rechazar', 'exportar', 'descargar', 'escanear'];
const blockedTags = new Set(['script', 'style', 'template', 'nav', 'aside', 'footer']);
const hidden = node => node.attrs?.some(a => a.name === 'hidden' || (a.name === 'aria-hidden' && a.value === 'true')) ||
  attr(node, 'class').split(/\s+/).includes('hidden') || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(node, 'style')) ||
  (node.tagName === 'input' && attr(node, 'type') === 'hidden');
function text(node) {
  if (blockedTags.has(node.tagName) || hidden(node)) return '';
  return node.nodeName === '#text' ? node.value : (node.childNodes || []).map(text).join(' ');
}
function descendants(node, predicate) {
  if (blockedTags.has(node.tagName) || hidden(node)) return [];
  return [...(predicate(node) ? [node] : []), ...(node.childNodes || []).flatMap(child => descendants(child, predicate))];
}
function listClauses(source, label) {
  const results = [];
  for (const match of source.matchAll(new RegExp('\\b' + label + '(?:\\s+obligatorios?)?\\s*:\\s*([^.;\\n]+)', 'gi'))) {
    results.push(...match[1].split(/[,;]|\s+(?:y|o)\s+/i).map(value => value.trim()).filter(Boolean));
  }
  return [...new Set(results)];
}

class MockupFunctionalCoverageService {
  expectations(requirement) {
    const source = [requirement.nombre, requirement.descripcion].filter(Boolean).join('. ');
    const normalized = normalize(source);
    const choices = new Map();
    const actors = new Set((Array.isArray(requirement.actores) ? requirement.actores : [requirement.actores]).flatMap(words));
    for (const match of normalized.matchAll(/\b([a-z]{3,})\s+o\s+([a-z]{3,})\b/g)) {
      const options = match.slice(1, 3);
      if (options.some(value => actions.includes(value) || actors.has(value))) continue;
      const key = options.join('|');
      const previous = normalized.slice(Math.max(0, match.index - 80), match.index);
      if (/\bestados?\s*:\s*[^.;]*$/.test(previous)) continue;
      const explicit = /(?:seleccionar|elegir|escoger|opciones?|tipo)\b/.test(previous);
      const existing = choices.get(key);
      choices.set(key, { tipo: 'opciones', valores: options, confianza: explicit || existing?.confianza === 'explicita' ? 'explicita' : 'inferida' });
    }
    return [
      ...listClauses(source, 'campos?').map(value => ({ tipo: 'campo', valores: [value], confianza: 'explicita' })),
      ...listClauses(source, 'estados?').map(value => ({ tipo: 'estado', valores: [value], confianza: 'explicita' })),
      ...actions.filter(action => [...normalized.matchAll(new RegExp('\\b' + action + '\\b', 'g'))]
        .some(match => !/\b(no|sin|evitar|impedir|prohibir)\b[^.;]{0,45}$/.test(normalized.slice(0, match.index))))
        .map(value => ({ tipo: 'accion', valores: [value], confianza: 'explicita' })),
      ...choices.values()
    ];
  }

  evidence(mockup) {
    if (!mockup.preview_code) return { fields: [], actions: [], choices: [], text: '', disponible: false };
    const document = parse(mockup.preview_code);
    const main = descendants(document, node => node.tagName === 'main')[0];
    const root = main || descendants(document, node => node.tagName === 'body')[0] || document;
    const labels = descendants(root, node => node.tagName === 'label');
    const controls = descendants(root, node => ['input', 'select', 'textarea'].includes(node.tagName) && !['submit', 'button', 'reset'].includes(attr(node, 'type')));
    const label = node => {
      const associated = labels.filter(l => attr(node, 'id') && attr(l, 'for') === attr(node, 'id')).map(text);
      let parent = node.parentNode;
      while (parent && parent !== root) { if (parent.tagName === 'label') associated.push(text(parent)); parent = parent.parentNode; }
      const group = node.parentNode;
      if (group && descendants(group, n => controls.includes(n)).length === 1) {
        associated.push(...descendants(group, n => n.tagName === 'label').map(text));
      }
      return [...associated, attr(node, 'aria-label'), attr(node, 'placeholder'), attr(node, 'name')].filter(Boolean).join(' ');
    };
    const choices = controls.filter(node => node.tagName === 'select').map(node => descendants(node, option => option.tagName === 'option').map(text).join(' '));
    const radioGroups = new Map();
    for (const node of controls.filter(n => ['radio', 'checkbox'].includes(attr(n, 'type')))) {
      // No mezclar opciones de formularios distintos.
      let form = node.parentNode;
      while (form && !['form', 'fieldset'].includes(form.tagName)) form = form.parentNode;
      const group = (form || root);
      if (!radioGroups.has(group)) radioGroups.set(group, new Map());
      const name = attr(node, 'type') === 'checkbox' ? 'checkbox' : (attr(node, 'name') || 'radio');
      const map = radioGroups.get(group);
      map.set(name, [...(map.get(name) || []), label(node) + ' ' + attr(node, 'value')]);
    }
    for (const group of radioGroups.values()) for (const values of group.values()) choices.push(values.join(' '));
    const tabs = descendants(root, node => ['tablist', 'radiogroup'].includes(attr(node, 'role')));
    choices.push(...tabs.map(text));
    return {
      fields: controls.map(label), choices, text: text(root), disponible: true,
      actions: descendants(root, node => ['button', 'a'].includes(node.tagName) || attr(node, 'role') === 'button' || (node.tagName === 'input' && ['submit', 'button'].includes(attr(node, 'type'))))
        .map(node => [text(node), attr(node, 'aria-label'), node.tagName === 'input' ? attr(node, 'value') : ''].join(' '))
    };
  }

  validate(requirement, mockups) {
    const expected = this.expectations(requirement);
    if (!expected.length) return [];
    const evidence = mockups.map(mockup => this.evidence(mockup));
    return expected.map(criterion => {
      const supported = evidence.some(item => {
        if (criterion.tipo === 'estado') return item.disponible && contains(item.text, criterion.valores[0]);
        const candidates = item[criterion.tipo === 'campo' ? 'fields' : criterion.tipo === 'accion' ? 'actions' : 'choices'];
        return candidates.some(candidate => criterion.valores.every(value => contains(candidate, value)));
      });
      return { ...criterion, presente: supported };
    });
  }
}

module.exports = MockupFunctionalCoverageService;
