import { getPlantUMLPngUrl } from './plantumlEncoder';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Se usa el mismo servidor PlantUML que en el visor de diagramas de I-CASE. */
export async function embedDocumentationDiagrams(bundle) {
  let html = bundle.html;
  const files = bundle.archivos.map(file => ({ ...file }));
  const warnings = [...bundle.advertencias];
  const pages = (bundle.paginas || []).map(page => ({ ...page }));
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
      for (const page of pages) page.html = page.html.replace(placeholder, image);
      for (const file of files) if (/\.(?:md|html)$/.test(file.ruta)) file.contenido = file.contenido.replace(placeholder, image);
    } catch {
      warnings.push(`No se pudo incluir la imagen de ${diagram.titulo}; se conserva su fuente editable.`);
    }
  }));
  return { ...bundle, archivos: files, html, paginas: pages, advertencias: warnings };
}

function text(context, value, x, y, width, lineHeight, maxLines = 3) {
  const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ');
  const lines = []; let line = '';
  for (const word of words) {
    if (line && context.measureText(`${line} ${word}`).width > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
    while (context.measureText(line).width > width) {
      let cut = line.length - 1;
      while (cut > 1 && context.measureText(line.slice(0, cut)).width > width) cut--;
      lines.push(line.slice(0, cut)); line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  for (let index = 0; index < Math.min(lines.length, maxLines); index++) {
    let value = lines[index];
    if (index === maxLines - 1 && lines.length > maxLines) {
      while (value && context.measureText(value + '…').width > width) value = value.slice(0, -1);
      value += '…';
    }
    context.fillText(value, x, y + index * lineHeight);
  }
}

function card(context, x, y, width, height, color, radius = 16) {
  context.fillStyle = color; context.beginPath(); context.roundRect(x, y, width, height, radius); context.fill();
}

function durations(tutorial, options = {}) {
  return (tutorial.steps || []).map(step => options.stepDurationMs || Math.min(10000, Math.max(5800, String(step.description + ' ' + step.before + ' ' + step.outcome).split(/\s+/).length * 105)));
}
export const getTutorialDuration = tutorial => durations(tutorial).reduce((sum, value) => sum + value, 0);

/** El póster y los videos comparten el mismo diseño. No se imita una pantalla real de la aplicación. */
export function drawTutorialFrame(context, tutorial, index = 0, progress = 0) {
  const steps = tutorial.steps || [];
  const step = steps[index];
  if (!step) return;
  context.fillStyle = '#f5f2fa'; context.fillRect(0, 0, 1280, 720);
  card(context, 36, 30, 54, 54, '#7c3aed', 15);
  context.fillStyle = 'white'; context.font = 'bold 27px system-ui'; context.fillText('▶', 51, 66);
  context.fillStyle = '#7c3aed'; context.font = 'bold 15px system-ui'; context.fillText('GUÍA DE USO · ' + (tutorial.role || 'PROYECTO').toUpperCase(), 110, 46);
  context.fillStyle = '#241a35'; context.font = 'bold 27px system-ui'; text(context, tutorial.project || tutorial.title, 110, 80, 1090, 31, 2);
  context.fillStyle = '#746780'; context.font = '18px system-ui'; text(context, tutorial.title, 40, 140, 1100, 24, 1);

  card(context, 36, 170, 310, 440, '#ffffff');
  context.fillStyle = '#82748e'; context.font = 'bold 13px system-ui'; context.fillText('TU RECORRIDO', 60, 204);
  const first = Math.max(0, index - 3);
  steps.slice(first, first + 4).forEach((item, offset) => {
    const number = first + offset; const active = number === index; const complete = number < index; const y = 228 + offset * 88;
    if (active) card(context, 48, y - 15, 286, 80, '#f1eaff', 12);
    card(context, 62, y, 30, 30, active ? '#7c3aed' : complete ? '#dcfce7' : '#f0edf4', 15);
    context.fillStyle = active ? '#ffffff' : complete ? '#15803d' : '#978a9f'; context.font = 'bold 14px system-ui'; context.fillText(complete ? '✓' : String(number + 1), 72, y + 21);
    context.fillStyle = active ? '#552295' : '#6e617b'; context.font = `${active ? 'bold ' : ''}16px system-ui`; text(context, item.title, 104, y + 17, 210, 22, 2);
  });

  card(context, 368, 170, 876, 440, '#ffffff');
  context.fillStyle = '#7c3aed'; context.font = 'bold 14px system-ui'; context.fillText(`${step.id || 'GUÍA'} · PASO ${index + 1} DE ${steps.length}`, 398, 205);
  context.fillStyle = '#241a35'; context.font = 'bold 28px system-ui'; text(context, step.title, 398, 244, 812, 34, 2);
  const stage = progress < 0.22 ? 0 : progress < 0.72 ? 1 : 2;
  const checks = [
    ['01', 'Preparar', step.before || 'Revisa el acceso y los datos necesarios.'],
    ['02', 'Ejecutar', step.description || 'Sigue los pasos documentados de esta función.'],
    ['03', 'Comprobar', step.outcome || 'Valida el resultado esperado en el manual.']
  ];
  checks.forEach(([number, label, description], offset) => {
    const y = 310 + offset * 94;
    card(context, 392, y, 828, 82, stage === offset ? '#f3edff' : '#fbfafd', 11);
    card(context, 405, y + 14, 42, 42, stage === offset ? '#7c3aed' : '#ece7f2', 11);
    context.fillStyle = stage === offset ? '#ffffff' : '#887795'; context.font = 'bold 15px system-ui'; context.fillText(number, 416, y + 41);
    context.fillStyle = stage === offset ? '#6d28d9' : '#70617f'; context.font = 'bold 12px system-ui'; context.fillText(label.toUpperCase(), 462, y + 22);
    context.fillStyle = '#3b3048'; context.font = '18px system-ui'; text(context, description, 462, y + 46, 738, 23, 2);
  });
  card(context, 36, 635, 1208, 7, '#e6deef', 4);
  card(context, 36, 635, Math.max(7, 1208 * (index + progress) / steps.length), 7, '#7c3aed', 4);
  context.fillStyle = '#8c8096'; context.font = '14px system-ui'; context.fillText('Guía animada basada en los requisitos · No es una grabación de la aplicación', 40, 681);
  context.textAlign = 'right'; context.fillText(`${index + 1} / ${steps.length}`, 1240, 681); context.textAlign = 'left';
}

export async function createTutorialVideo(tutorial, onProgress = () => {}, options = {}) {
  if (!tutorial.steps?.length) throw new Error('Esta guía no tiene pasos documentados.');
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) throw new Error('Este navegador no permite exportar videos. Usa Chrome, Brave o Edge.');
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('No hay un codificador WebM disponible en este navegador.');
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
  const context = canvas.getContext('2d');
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2200000 });
  const parts = [];
  const result = new Promise((resolve, reject) => {
    recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
    recorder.onstop = () => resolve(new Blob(parts, { type: 'video/webm' }));
    recorder.onerror = event => reject(new Error(event.error?.message || 'No se pudo codificar el video.'));
  });
  const times = durations(tutorial, options);
  const total = times.reduce((sum, value) => sum + value, 0);
  let timer; let active = -1;
  try {
    recorder.start(250);
    const started = performance.now();
    const frame = () => {
      let elapsed = Math.min(performance.now() - started, total - 1); let index = 0;
      while (index < times.length - 1 && elapsed >= times[index]) { elapsed -= times[index]; index++; }
      if (index !== active) { active = index; onProgress(index + 1, times.length); }
      drawTutorialFrame(context, tutorial, index, Math.min(1, elapsed / times[index]));
      stream.getVideoTracks()[0]?.requestFrame?.();
    };
    frame(); timer = setInterval(frame, 1000 / 24);
    await Promise.race([new Promise(resolve => setTimeout(resolve, total)), result]);
    clearInterval(timer); recorder.stop();
    const video = await result;
    if (!video.size) throw new Error('No se capturaron imágenes. Mantén esta pestaña visible durante la generación.');
    return video;
  } finally {
    clearInterval(timer);
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach(track => track.stop());
  }
}
