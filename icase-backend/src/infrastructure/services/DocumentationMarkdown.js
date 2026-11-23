const MarkdownIt = require('markdown-it');
const path = require('node:path');
const crypto = require('node:crypto');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const anchor = name => 'repo-' + crypto.createHash('sha256').update(name).digest('hex').slice(0, 12);

/** Markdown de los artefactos: HTML desactivado y protocolos de enlaces validados por markdown-it. */
function renderRepositoryDocuments(files) {
  const paths = new Set(files.map(file => file.ruta.replace(/\\/g, '/')));
  return files.map(file => {
    const markdown = new MarkdownIt({ html: false, linkify: true });
    const originalLink = markdown.renderer.rules.link_open || ((tokens, index, options, env, renderer) => renderer.renderToken(tokens, index, options));
    markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
      const token = tokens[index];
      const href = token.attrGet('href') || '';
      if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) {
        const [target] = href.split(/[?#]/);
        let decoded = target;
        try { decoded = decodeURIComponent(target); } catch { /* Conservar enlace legible. */ }
        const destination = path.posix.normalize(path.posix.join(path.posix.dirname(file.ruta.replace(/\\/g, '/')), decoded));
        if (paths.has(destination)) token.attrSet('href', '#' + anchor(destination));
      }
      token.attrSet('rel', 'noreferrer noopener');
      return originalLink(tokens, index, options, env, renderer);
    };
    markdown.renderer.rules.table_open = () => '<div class="doc-table"><table>';
    markdown.renderer.rules.table_close = () => '</table></div>';
    return `<article class="repository-document" id="${anchor(file.ruta.replace(/\\/g, '/'))}"><div class="document-path">${escape(file.ruta)}</div><div class="markdown-body">${markdown.render(file.contenido || '')}</div><details class="source-details"><summary>Ver Markdown original</summary><pre><code>${escape(file.contenido)}</code></pre></details></article>`;
  }).join('');
}
module.exports = { renderRepositoryDocuments };
