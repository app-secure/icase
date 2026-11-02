const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../verification-results/zip-current');
const generation = JSON.parse(fs.readFileSync(path.join(root, 'report.json')));
const runtime = JSON.parse(fs.readFileSync(path.join(root, 'arranque.json')));
const baselines = JSON.parse(fs.readFileSync(path.join(root, 'bases-generadas.json')));
const instructions = JSON.parse(fs.readFileSync(path.join(root, 'instrucciones.json')));
const extracted = fs.readdirSync(root).filter(name => name.startsWith('extracted-'));
if (extracted.length !== 1) throw new Error('Se requiere una extracción inequívoca');
const directory = path.join(root, extracted[0]);
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'delivery-manifest.json')));
for (const file of manifest.archivos) {
  const target = path.resolve(directory, file.ruta);
  if (!target.startsWith(directory + path.sep)) throw new Error('Ruta insegura en manifiesto');
  if (crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== file.huella) throw new Error('Integridad incorrecta: ' + file.ruta);
}
const bytes = fs.readFileSync(path.join(root, 'entrega.zip'));
const backend = JSON.parse(fs.readFileSync(path.join(directory, 'backend/icase.manifest.json')));
const browser = runtime.pruebas.find(p => p.paso.includes('navegador'))?.salida || '';
const summary = {
  fecha: new Date().toISOString(), estado: runtime.estado, bytes: bytes.length,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'), archivosVerificados: manifest.archivos.length,
  generacionNueva: generation.etapas.length === 6 && generation.etapas.every(s => s.aprobado),
  modoEntrega: manifest.alcance?.modo_entrega, pendientesAceptados: manifest.alcance?.aceptar_pendientes,
  pruebas: runtime.pruebas.map(p => ({ paso: p.paso, resultado: p.resultado })),
  navegador: { correctas: Number(browser.match(/(\d+) passed/)?.[1] || 0), omitidas: Number(browser.match(/(\d+) skipped/)?.[1] || 0) },
  asociacionesEnContrato: (backend.associations || []).length,
  basesActuales: baselines.correcto,
  instruccionesValidas: instructions.every(item => item.configuracionValida && item.secretosDePruebaCargados),
  plataformaApagadaAcreditada: runtime.plataformaDetenida,
  limites: 'Entrega parcial; no certifica procesos completos del restaurante, hardware, disponibilidad, nube o APK. CI/CD generado se valida estructuralmente, no se ejecutó remotamente en esta prueba.'
};
fs.writeFileSync(path.join(root, 'resumen.json'), JSON.stringify(summary, null, 2));
const text = [
  '# ZIP regenerado y verificado con el código actual', '',
  'Fecha local: 1 de noviembre de 2026 (America/Guayaquil). Se copió a una base aislada el proyecto sintético previamente aprobado. Se conservaron las decisiones y el diseño, pero no se copiaron artefactos de código ni verificaciones anteriores. Los seis artefactos se generaron, verificaron y aprobaron por los endpoints autenticados normales.', '',
  '**Resultado: entrega parcial ejecutable, técnicamente verificada. No es un restaurante completo certificado.**', '',
  `ZIP descargado: ${summary.bytes} bytes; ${summary.archivosVerificados} archivos del manifiesto comprobados con SHA-256 antes y después de la ejecución. SHA-256 del ZIP: ${summary.sha256}.`, '',
  '## Pruebas sobre el ZIP recibido', '',
  '| Comprobación | Resultado |', '| --- | --- |',
  ...summary.pruebas.map(p => `| ${p.paso} | ${p.resultado} |`), '',
  `Navegador: ${summary.navegador.correctas} pruebas correctas y ${summary.navegador.omitidas} omitida(s). La prueba omitida de reglas no se presenta como ejercitada. Asociaciones N:M en este contrato: ${summary.asociacionesEnContrato}; las etiquetas genéricas del verificador no acreditan escenarios ausentes del contrato.`, '',
  'Se ejecutaron los Dockerfiles y Compose exportados. El overlay de pruebas aísla red, puertos y credenciales y añade clientes de comprobación, sin editar los archivos declarados en el manifiesto. No se reconstruyó código desde MongoDB. Los recursos Docker de la entrega se retiraron al finalizar.', '',
  '## Actualizaciones e instrucciones', '',
  'El ZIP contiene Playwright 1.56.1, Expo 58.0.22 con React 19.3.0 y React Native 0.88.1, y el pipeline fijado en Ubuntu 24.04 con límites de solicitudes exclusivos de CI. La verificación previa del frontend y del paquete compiló el bundle Android; esto no es un APK ni una prueba en dispositivo.', '',
  'Los comandos documentados se comprobaron mediante docker compose config desde la raíz, desde ops y con --env-file explícito: configuración válida y variables de prueba cargadas en los tres casos. Las variables temporales quedan solo en la carpeta extraída de pruebas, no en el ZIP descargado.', '',
  '## Alcance y limitaciones', '',
  'Se mantuvo el alcance parcial ya aprobado: permanecen pendientes capacidades como tiempo real, cálculos, dispositivos y reportes, y las confirmaciones por RF que el informe de generación marca como pendientes. Aprobar las verificaciones técnicas no implementa esas capacidades ni certifica todas las reglas del negocio.', '',
  'No se revalidó semánticamente todo el diseño histórico ni se sustituyeron sus mockups por los de las pruebas posteriores. No se ejecutó un CI/CD remoto nuevo ni un despliegue cloud. La sonda aún detectó una respuesta del puerto de iCase de prueba: no se acredita que iCase estuviera apagado. El despliegue usa sus propios servicios en una red Docker interna; no se afirma lo contrario.', '',
  'Se corrigió un error del automatizador al registrar response.status; la descarga se repitió sin regenerar ni reaprobar. El diagnóstico original permanece en report-automatizador.json.', '',
  '## Evidencias', '',
  '- entrega.zip: descarga recibida del endpoint normal, sin reconstrucción local.',
  '- fixture.json y report.json: origen, etapas, nuevas verificaciones y aprobaciones.',
  '- arranque.json: ejecución sobre los archivos extraídos.',
  '- bases-generadas.json, instrucciones.json y resumen.json: comprobaciones complementarias.',
  '- extracted-*: copia de ejecución; contiene entornos privados de prueba y no debe compartirse entera.', '',
  'No compartir login.private.json ni los archivos de entorno temporal. El ZIP conserva los ejemplos de configuración exportados, no las credenciales temporales del verificador.', ''
].join('\n');
fs.writeFileSync(path.join(root, 'resultado.md'), text);
console.log(JSON.stringify(summary));
if (summary.estado !== 'apta' || !summary.generacionNueva || !summary.basesActuales || !summary.instruccionesValidas) process.exitCode = 1;
