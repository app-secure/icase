import { getPlantUMLPngUrl } from './plantumlEncoder';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Se usa el mismo servidor PlantUML que en el visor de diagramas de I-CASE. */
export async function embedDocumentationDiagrams(bundle) {
  let html = bundle.html;
  const files = bundle.archivos.map(file => ({ ...file }));
  const warnings = [...bundle.advertencias];
  await Promise.all((bundle.diagramas || []).map(async (diagram, index) => {
    if (!diagram.codigo_plantuml) return;
    try {
      const response = await fetch(getPlantUMLPngUrl(diagram.codigo_plantuml), { signal: AbortSignal.timeout(20000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error();
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
      const placeholder = `<div data-diagram-index="${index}"></div>`;
      const image = `<figure><img src="${dataUrl}" alt="${escape(diagram.titulo)}"><figcaption>${escape(diagram.titulo)}</figcaption></figure>`;
      html = html.replace(placeholder, image);
      for (const file of files) if (/\.(?:md|html)$/.test(file.ruta)) file.contenido = file.contenido.replace(placeholder, image);
    } catch {
      warnings.push(`No se pudo incluir la imagen de ${diagram.titulo}; se conserva su fuente editable.`);
    }
  }));
  return { ...bundle, archivos: files, html, advertencias: warnings };
}

function wrapped(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || '').split(/\s+/);
  let line = ''; let count = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      count += 1;
      context.fillText(count === maxLines ? `${line.slice(0, -3)}…` : line, x, y);
      if (count === maxLines) return;
      y += lineHeight; line = word;
    } else line = next;
  }
  if (line) context.fillText(line, x, y);
}

/** Tutorial narrativo animado: nunca se presenta como captura de la aplicación. */
export async function createTutorialVideo(tutorial, onProgress = () => {}) {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) throw new Error('Este navegador no permite exportar videos. Usa Chrome o Edge.');
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('No hay un codificador WebM disponible en este navegador.');
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
  const context = canvas.getContext('2d');
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1600000 });
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    recorder.onerror = event => reject(new Error(event.error?.message || 'No se pudo codificar el video.'));
  });
  const steps = tutorial.steps.slice(0, 6);
  const frame = index => {
    context.fillStyle = '#102740'; context.fillRect(0, 0, 1280, 720);
    context.fillStyle = '#8cbcff'; context.font = '22px sans-serif';
    context.fillText('GUÍA ANIMADA · PROYECTO GENERADO', 72, 66);
    context.fillStyle = '#ffffff'; context.font = 'bold 34px sans-serif';
    wrapped(context, tutorial.title, 72, 126, 1120, 42, 2);
    context.fillStyle = '#74aaff'; context.font = '26px sans-serif';
    context.fillText(`PASO ${index + 1} / ${steps.length}`, 72, 258);
    context.fillStyle = '#ffffff'; context.font = 'bold 42px sans-serif';
    wrapped(context, steps[index].title, 72, 326, 1120, 52, 2);
    context.fillStyle = '#ccdbef'; context.font = '27px sans-serif';
    wrapped(context, steps[index].description, 72, 470, 1120, 36, 3);
    context.fillStyle = '#294463'; context.fillRect(72, 624, 1120, 8);
    context.fillStyle = '#75aaff'; context.fillRect(72, 624, 1120 * (index + 1) / steps.length, 8);
    context.fillStyle = '#aac1db'; context.font = '19px sans-serif';
    context.fillText('Explica pasos documentados; no es una grabación ni evidencia de pruebas.', 72, 677);
  };
  let activeIndex = 0;
  let redrawTimer;
  try {
    recorder.start(250);
    // También capturar tutoriales de un solo paso: dibujar antes de start puede producir un WebM vacío.
    redrawTimer = setInterval(() => {
      frame(activeIndex);
      stream.getVideoTracks()[0]?.requestFrame?.();
    }, 1000 / 24);
    for (let index = 0; index < steps.length; index += 1) {
      activeIndex = index; frame(index); onProgress(index + 1, steps.length);
      await new Promise(resolve => setTimeout(resolve, 2800));
    }
    recorder.stop();
    const video = await result;
    if (!video.size) throw new Error('El navegador no capturó imágenes del video. Mantén esta pestaña visible y vuelve a intentar.');
    return video;
  } finally {
    clearInterval(redrawTimer);
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach(track => track.stop());
  }
}
