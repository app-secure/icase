export function imageFilename(title) {
  return (String(title || 'diagrama').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'diagrama') + '.png';
}

export async function diagramPng(svg) {
  if (!svg || !svg.includes('<svg')) throw new Error('La imagen no está disponible. Espera a que termine de cargar.');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('No se pudo convertir el diagrama en imagen.'));
      img.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('El diagrama no tiene dimensiones válidas.');
    // Imagen completa, independiente del zoom o scroll; acota memoria para diagramas grandes.
    const scale = Math.min(2, 8192 / Math.max(img.naturalWidth, img.naturalHeight),
      Math.sqrt(16000000 / (img.naturalWidth * img.naturalHeight)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no permite crear la imagen.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo crear el PNG.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export function downloadDiagram(blob, title) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = imageFilename(title);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
