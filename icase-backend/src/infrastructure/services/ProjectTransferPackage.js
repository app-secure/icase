const crypto = require('node:crypto');
const FORMAT = 'icase-project';
const VERSION = 1;
const MAX_BYTES = 64 * 1024 * 1024;
const GROUPS = ['proyecto', 'fuentes', 'analisis', 'requisitos', 'diagramas', 'casos_uso', 'disenos', 'plan_codigo', 'artefactos_codigo'];
const fail = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
const hash = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))).digest('hex');
function safeObject(value, depth = 0) {
  if (depth > 100) throw fail('El paquete tiene una estructura demasiado profunda.');
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || key.startsWith('$') && !['$schema', '$ref', '$defs', '$id', '$comment'].includes(key)) throw fail('El paquete contiene claves no permitidas.');
    safeObject(item, depth + 1);
  }
}
function counts(data) {
  return { ...Object.fromEntries(GROUPS.map(key => [key, data[key].length])),
    mockups: data.disenos.reduce((n, d) => n + (d.mockups || []).length, 0),
    archivos_codigo: data.artefactos_codigo.reduce((n, a) => n + (a.archivos || []).length, 0) };
}
function report(manifest, extra = '') {
  return `# Verificación de transferencia I-CASE\n\nFecha: ${manifest.created_at}\n\nFormato: ${FORMAT} v${VERSION}\n\n` +
    Object.entries(manifest.counts).map(([k, v]) => `- ${k}: ${v}`).join('\n') +
    `\n- Originales adjuntos: ${manifest.files.length}\n\n## Integridad\n\nSHA-256 de datos: \`${manifest.data_sha256}\`\n\n` +
    manifest.files.map(f => `- ${f.id}: ${f.bytes} bytes; SHA-256 \`${f.sha256}\``).join('\n') +
    `\n\n## Alcance y límites\n\n- Incluye versiones, aprobaciones, evidencias y código almacenados; no acredita la calidad semántica ni ejecución del software.\n- No incluye cuentas, sesiones, claves de proveedores, trabajos, checkpoints, bloqueos ni contenedores de Docker.\n- Los originales, transcripciones y código pueden contener información sensible aportada al proyecto: revísalos antes de compartir.\n- SHA-256 detecta alteraciones; no es firma digital ni acredita autoría. No importes paquetes de procedencia desconocida.\n- Las aprobaciones importadas se conservan como historial, no como una evaluación nueva del receptor.\n- Las verificaciones de ejecución del código deben repetirse en el equipo receptor.\n\n${extra}\n`;
}
function create(data, files, schema) {
  const manifest = { format: FORMAT, version: VERSION, created_at: new Date().toISOString(), schema,
    counts: counts(data), data_sha256: hash(data), files: files.map(f => ({ id: f.id, bytes: Buffer.from(f.base64, 'base64').length, sha256: hash(Buffer.from(f.base64, 'base64')) })) };
  return { manifest, data, files, report_markdown: report(manifest) };
}
function verify(input, schema) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(typeof input === 'string' ? input : JSON.stringify(input));
  if (bytes.length > MAX_BYTES) throw fail('El paquete supera el límite de 64 MB.', 413);
  let bundle;
  try { bundle = JSON.parse(bytes.toString('utf8')); } catch { throw fail('El archivo no contiene un paquete JSON válido.'); }
  safeObject(bundle);
  const { manifest: m, data, files } = bundle;
  if (!m || m.format !== FORMAT || m.version !== VERSION) throw fail('Formato o versión de transferencia no compatible.');
  if (m.schema !== schema) throw fail('Los esquemas no coinciden. Usa la misma versión de I-CASE en ambos equipos.', 409);
  if (!data || Object.keys(data).sort().join() !== [...GROUPS].sort().join() || GROUPS.some(k => !Array.isArray(data[k]))) throw fail('Faltan secciones o existen secciones no admitidas.');
  if (GROUPS.reduce((n, k) => n + data[k].length, 0) > 10000 || data.proyecto.length !== 1 || data.disenos.length > 1 || data.plan_codigo.length > 1) throw fail('Cantidad de registros no válida.');
  if (!Array.isArray(files) || !Array.isArray(m.files) || files.length !== data.fuentes.filter(f => f.ruta_archivo).length || files.length !== m.files.length) throw fail('No coinciden los originales de las fuentes.');
  if (m.data_sha256 !== hash(data) || hash(m.counts) !== hash(counts(data))) throw fail('La integridad o el recuento de datos no coincide.');
  const ids = new Set();
  const projectId = data.proyecto[0]._id;
  const objectId = /^[a-f\d]{24}$/i;
  for (const group of GROUPS) for (const row of data[group]) {
    if (!row || !objectId.test(row._id || '') || ids.has(row._id)) throw fail('Hay identificadores inválidos o duplicados.');
    ids.add(row._id);
    if (group !== 'proyecto' && row.proyecto_id !== projectId) throw fail('El paquete contiene datos de otro proyecto.');
  }
  for (const key of ['analisis_inicial_borrador_id', 'analisis_inicial_aprobado_id']) {
    if (data.proyecto[0][key] && !data.analisis.some(a => a._id === data.proyecto[0][key])) throw fail('Falta una versión de análisis referenciada por el proyecto.');
  }
  const seenFiles = new Set();
  for (const file of files) {
    if (!objectId.test(file.id || '') || seenFiles.has(file.id) || typeof file.base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) throw fail('Original de fuente inválido o duplicado.');
    seenFiles.add(file.id);
    const source = data.fuentes.find(f => f._id === file.id);
    const expected = m.files.find(f => f.id === file.id);
    const content = Buffer.from(file.base64, 'base64');
    if (!source || source.ruta_archivo !== `files/${file.id}` || !expected || content.length !== expected.bytes || hash(content) !== expected.sha256) throw fail('La integridad de un original de fuente no coincide.');
  }
  // El informe del remitente no se utiliza para decidir integridad: se regenera.
  return { manifest: m, data, files, report_markdown: report(m, 'Verificación de estructura, recuentos y huellas: correcta.') };
}
module.exports = { FORMAT, VERSION, MAX_BYTES, GROUPS, fail, hash, counts, create, verify, report };
