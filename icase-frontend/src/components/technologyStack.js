// Separa el stack del resto de restricciones técnicas para mostrarlo una sola vez.
const GENERIC = new Set(['API', 'HTTP', 'HTTPS', 'JSON', 'UI', 'UX', 'REST', 'CRUD', 'KDS', 'IDE', 'SQL']);
const ORDINARY = new Set(['Los', 'Las', 'El', 'La', 'Si', 'No', 'Para', 'Con', 'Sin', 'Cada', 'Solo', 'Esta', 'Este', 'Eso', 'Aqui', 'Alli', 'Tambien', 'Pero', 'Como', 'Cuando', 'Donde', 'Sobre', 'Entre', 'Hasta', 'Desde', 'Todo', 'Toda', 'Un', 'Una', 'Que', 'Sus', 'Del', 'Al']);

function plain(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function productNames(text) {
  const shaped = text.match(/\b(?:[A-Z][a-z0-9]+[A-Z][A-Za-z0-9.+#]*|[A-Z]{2,5}|[A-Za-z0-9]+\.(?:js|io|ts))\b/g) || [];
  const adopted = [...text.matchAll(/\b(?:propon(?:emos|e)|usemos|usaremos|utilizar(?:emos)?|usar|se usara|desplegar|publicar)(?:\s+\p{L}+){0,6}\s+([A-Z][\p{L}0-9.+#-]*)/giu)].map(match => match[1]);
  const named = [...text.matchAll(/(?<=\s)([A-Z][\p{L}0-9.+#-]{2,})/gu)].map(match => match[1].replace(/[^\p{L}0-9]+$/u, '')).filter(name => !ORDINARY.has(name));
  return [...shaped, ...adopted, ...named].map(name => name.replace(/[^\p{L}0-9.+#]+$/u, '')).filter(name => name && !GENERIC.has(name.toUpperCase()));
}

export function isTechnologyStack(item) {
  if (item?.tipo && item.tipo !== 'restriccion_tecnica') return false;
  if (item?.grupo === 'stack') return true;
  if (item?.grupo === 'restriccion') return false;
  const text = `${item?.necesidad || ''} ${item?.evidencia || ''}`;
  const normalized = plain(text);
  if (/\bno\b[^.]{0,80}\b(?:asum|usar tecnologias|implementar tecnologias)/.test(normalized)) return false;
  const names = productNames(text).filter(name => name.toUpperCase() !== 'KDS');
  const channel = /\b(?:tablets?|tabletas?|celulares?|pantallas? grandes|computadoras?)\b/i.test(normalized);
  if (channel && !names.length) return false;
  if (/\bpantalla\b/.test(normalized) && !names.length) return false;
  return names.length > 0;
}
