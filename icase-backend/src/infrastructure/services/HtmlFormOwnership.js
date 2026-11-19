const attr = (node, name) => node?.attrs?.find(a => a.name === name)?.value || '';
const walk = node => [node, ...(node.childNodes || []).flatMap(walk)];
const rootOf = node => node.parentNode ? rootOf(node.parentNode) : node;

/** Asociación HTML: form="id" tiene prioridad sobre el formulario ancestro. */
function formOf(node) {
  if (!node) return null;
  if (node.tagName === 'form') return node;
  if (node.attrs?.some(a => a.name === 'form')) {
    const id = attr(node, 'form');
    const target = id && walk(rootOf(node)).find(n => attr(n, 'id') === id);
    return target?.tagName === 'form' ? target : null;
  }
  let parent = node.parentNode;
  while (parent && parent.tagName !== 'form') parent = parent.parentNode;
  return parent || null;
}

module.exports = { attr, walk, rootOf, formOf };
