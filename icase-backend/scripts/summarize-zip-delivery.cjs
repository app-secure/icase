const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../verification-results/zip-delivery');
const ui = JSON.parse(fs.readFileSync(path.join(root, 'report.json'), 'utf8'));
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'arranque.json'), 'utf8'));
const instructions = JSON.parse(fs.readFileSync(path.join(root, 'instrucciones.json'), 'utf8'));
const zip = fs.readFileSync(path.join(root, 'entrega.zip'));
const summary = {
  descarga: ui.estado, bytes: zip.length, sha256: crypto.createHash('sha256').update(zip).digest('hex'),
  arranque: runtime.estado, plataformaDetenida: runtime.plataformaDetenida,
  archivosVerificados: runtime.archivosVerificados, alcance: runtime.alcance.modo_entrega,
  limitacionesAceptadas: runtime.alcance.aceptar_pendientes,
  pruebas: runtime.pruebas.map(p => ({ paso: p.paso, resultado: p.resultado })), instrucciones: instructions
};
fs.writeFileSync(path.join(root, 'resumen.json'), JSON.stringify(summary, null, 2));
const text = [
  '# Descarga y arranque del ZIP — 1 de noviembre de 2026', '',
  'Se confirmó por interfaz la entrega parcial del proyecto sintético y sus limitaciones. Se regeneraron y revisaron los artefactos afectados sin editar manualmente su código. El paquete pasó su verificación previa, se aprobó y Chromium descargó entrega.zip.', '',
  `Archivo descargado: ${zip.length} bytes. SHA-256: ${summary.sha256}.`, '',
  `Resultado del arranque: **${runtime.estado}**. iCase detenido durante la segunda ejecución independiente: **${runtime.plataformaDetenida ? 'sí' : 'no acreditado'}**.`, '',
  '## Verificación del contenido descargado', '',
  `Se extrajo el ZIP en una carpeta exclusiva con validación de rutas y se comprobaron ${runtime.archivosVerificados} huellas del manifiesto antes y después de ejecutar las pruebas. No se reconstruyó el proyecto desde MongoDB ni se corrigieron fuentes o Dockerfiles exportados.`, '',
  '| Comprobación | Resultado |', '| --- | --- |',
  ...summary.pruebas.map(p => `| ${p.paso} | ${p.resultado} |`), '',
  'El despliegue usó el Compose y Dockerfiles del ZIP, con un overlay de prueba que aísla red, puertos y credenciales, y añade clientes de pruebas. Los auxiliares no modifican los archivos declarados en el manifiesto. Se comprobó además la interpolación del entorno de los comandos documentados, tanto desde la raíz como desde ops.', '',
  '## Alcance y límites', '',
  '**Entrega parcial ejecutable; no es un restaurante completo certificado.** El manifiesto conserva los RF pendientes y las capacidades sin implementación, como tiempo real, cálculos y dispositivos. Confirmar la entrega parcial no activa esas funciones.', '',
  'Se acreditan compilación, arranque, disponibilidad HTTP y las operaciones/controles ejercitados por las pruebas generadas. No acredita despliegue en nube, ejecución de GitHub Actions, APK/IPA firmado, dispositivo móvil real ni cobertura semántica completa de todos los RF/RNF.', '',
  '## Evidencias', '',
  '- entrega.zip: archivo recibido desde el navegador.',
  '- report.json y capturas PNG: aprobaciones y descarga por interfaz.',
  '- arranque.json: ejecución independiente y comprobación explícita de disponibilidad de la plataforma (no asumir que estaba apagada).',
  '- arranque-inicial.json: primera ejecución externa.',
  '- instrucciones.json y resumen.json: configuración y resumen verificable.',
  '- extracted-*: contenido extraído y auxiliares de prueba; los entornos con credenciales temporales son privados.', '',
  'Los recursos Docker creados por los verificadores se retiran al finalizar; se conservan ZIP, carpeta extraída y evidencias. No compartir login.private.json ni los archivos de entorno de prueba.', ''
];
fs.writeFileSync(path.join(root, 'resultado.md'), text.join('\n'));
console.log(JSON.stringify({ descarga: summary.descarga, arranque: summary.arranque, bytes: summary.bytes, archivos: summary.archivosVerificados, plataformaDetenida: summary.plataformaDetenida, alcance: summary.alcance }));
