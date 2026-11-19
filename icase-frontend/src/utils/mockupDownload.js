import { zipSync, strToU8 } from 'fflate';

export function mockupFilename(name, index = 0) {
  const safe = String(name || 'mockup').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 100).replace(/^-+|-+$/g, '') || 'mockup';
  return `${index ? `${String(index).padStart(3, '0')}-` : ''}${safe}.html`;
}
export function htmlZip(files) {
  const entries = Object.fromEntries(files.map(f => [f.name, strToU8(f.html)]));
  return new Blob([zipSync(entries)], { type: 'application/zip' });
}
export function downloadMockupBlob(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
