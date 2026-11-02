const embeddedStyles = new Map();
const fontHost = url => /(^|\.)fonts\.(googleapis|gstatic)\.com$/i.test(new URL(url).hostname);

async function embedSheet(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('No se pudo obtener la hoja tipográfica');
  const css = await response.text();
  const faces = css.match(/@font-face\s*\{[^}]*\}/g) || [];
  return (await Promise.all(faces.map(async face => {
    const urls = [...face.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)];
    for (const match of urls) {
      const resource = new URL(match[1], url).href;
      if (!fontHost(resource)) continue;
      const font = await fetch(resource, { signal: AbortSignal.timeout(5000) });
      if (!font.ok) throw new Error('No se pudo obtener la fuente');
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        font.blob().then(blob => reader.readAsDataURL(blob), reject);
      });
      face = face.replace(match[0], `url("${data}")`);
    }
    return face;
  }))).join('\n');
}

// Un SVG foreignObject no puede recuperar fuentes externas. Incluirlas dentro
// del nodo capturado evita el cambio de métricas y el solapamiento de textos.
export async function embedCaptureFonts(doc) {
  const urls = [...doc.querySelectorAll('link[rel="stylesheet"][href]')]
    .map(link => link.href).filter(url => { try { return fontHost(url); } catch { return false; } });
  const styles = await Promise.all([...new Set(urls)].map(url => {
    if (!embeddedStyles.has(url)) embeddedStyles.set(url, embedSheet(url).catch(error => { embeddedStyles.delete(url); throw error; }));
    return embeddedStyles.get(url);
  }));
  if (!styles.length) return '';
  const style = doc.createElement('style');
  style.id = 'icase-capture-fonts';
  style.textContent = styles.join('\n');
  doc.body.prepend(style);
  await doc.fonts.ready;
  return style.textContent;
}
