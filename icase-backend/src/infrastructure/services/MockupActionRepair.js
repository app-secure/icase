const { parse, serialize } = require('parse5');

const VERBS = new Set(['consultar', 'crear', 'editar', 'eliminar']);
const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (value) => strip(value).split(/[^a-z0-9]+/).filter((word) => word.length > 3);
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value || '';
const textOf = (node) => (node.nodeName === '#text' ? node.value : (node.childNodes || []).map(textOf).join(' ')).replace(/\s+/g, ' ').trim();
function walk(node, visit) { visit(node); (node.childNodes || []).forEach((child) => walk(child, visit)); }

/**
 * Los modelos pequeños a veces escriben `data-accion="editar"` en lugar de `data-accion="RF-07.editar"`: el botón queda
 * desconectado del backend. Si la pantalla trata un solo requisito, o el texto del botón se parece a uno solo de los que
 * trata, se completa el prefijo; si hay duda, se deja como está para que el aviso de enlace inválido lo señale.
 */
class MockupActionRepair {
  /** @returns {{ html: string, reparadas: string[] }} */
  reparar(html, { rfs = [], requerimientos = [] } = {}) {
    if (!html || !/data-accion="(?:consultar|crear|editar|eliminar)"/i.test(html)) return { html, reparadas: [] };
    const approved = new Map((requerimientos || [])
      .filter((item) => String(item.tipo || '').toUpperCase() === 'RF' && item.identificador && item.aprobado !== false)
      .map((item) => [String(item.identificador).toUpperCase(), item]));
    const candidates = [...new Set((rfs || []).map((id) => String(id).trim().toUpperCase()))].filter((id) => approved.has(id));
    if (!candidates.length) return { html, reparadas: [] };

    const document = parse(html);
    const reparadas = [];
    walk(document, (node) => {
      const action = node.attrs?.find((item) => item.name === 'data-accion');
      const verb = action && strip(action.value);
      if (!verb || !VERBS.has(verb)) return;
      const rf = candidates.length === 1 ? candidates[0] : this._elegir(node, candidates, approved);
      if (!rf) return;
      action.value = `${rf}.${verb}`;
      reparadas.push(`${textOf(node) || attr(node, 'value') || verb} → ${action.value}`);
    });
    return reparadas.length ? { html: serialize(document), reparadas } : { html, reparadas: [] };
  }

  /** El requisito cuyo nombre y descripción comparten más palabras con el texto del botón y de su fila; solo si gana con claridad. */
  _elegir(node, candidates, approved) {
    const own = new Set(words(textOf(node) || attr(node, 'value')));
    let context = node;
    for (let depth = 0; depth < 3 && context.parentNode; depth += 1) context = context.parentNode;
    const nearby = new Set(words(textOf(context)).slice(0, 40));
    const scores = candidates.map((id) => {
      const requirement = approved.get(id);
      const vocabulary = new Set(words(`${requirement.nombre || ''} ${requirement.titulo || ''} ${requirement.descripcion || ''}`));
      // Las palabras del propio botón pesan más que las del entorno.
      const propio = [...own].filter((word) => [...vocabulary].some((term) => term.startsWith(word.slice(0, 5)) || word.startsWith(term.slice(0, 5)))).length;
      return { id, propio, score: propio * 3 + [...nearby].filter((word) => vocabulary.has(word)).length };
    }).sort((left, right) => right.score - left.score);
    // Sin ninguna palabra del propio botón en un requisito, el entorno solo no basta para decidir.
    return scores[0].propio > 0 && scores[0].score > scores[1].score ? scores[0].id : null;
  }
}

module.exports = MockupActionRepair;
