const crypto = require('crypto');
const IGeneradorArtefacto = require('../../core/services/IGeneradorArtefacto');
const GenerationCoverageService = require('../../core/services/GenerationCoverageService');

class DeliveryPackageGenerator extends IGeneradorArtefacto {
  async generar({ proyecto, insumos, versionesOrigen }) {
    const artifacts = insumos.artefactos;
    const byPath = new Map();
    for (const artifact of artifacts) {
      for (const file of artifact.archivos || []) {
        const existing = byPath.get(file.ruta);
        if (existing && existing.contenido !== file.contenido) {
          throw new Error(`Conflicto en el paquete final: ${file.ruta} tiene contenidos distintos.`);
        }
        byPath.set(file.ruta, { ...file });
      }
    }
    const cobertura = new GenerationCoverageService().exigirEntrega({ archivos: [...byPath.values()] });
    if(!byPath.has('.gitignore'))byPath.set('.gitignore',{ruta:'.gitignore',lenguaje:'gitignore',contenido:'**/node_modules/\n**/app-data/\n**/.env\n**/.env.*\n!**/.env.example\n.icase/backups/\n**/test-results/\n**/playwright-report/\n'});
    const fs=require('node:fs'),tp=require('node:path');
    const updater=fs.readFileSync(tp.join(__dirname,'../templates/verification/safe-update.cjs'),'utf8');
    byPath.set('tools/update.cjs',{ruta:'tools/update.cjs',lenguaje:'javascript',contenido:updater});
    const backfill=fs.readFileSync(tp.join(__dirname,'../templates/verification/backfill-owners.cjs'),'utf8');
    byPath.set('tools/backfill-owners.cjs',{ruta:'tools/backfill-owners.cjs',lenguaje:'javascript',contenido:backfill});
    const manifest = {
      alcance: cobertura,
      proyecto: proyecto.nombre,
      generado_en: new Date().toISOString(),
      artefactos: artifacts.map((item) => ({ tipo: item.tipo, version: item.version, huella_entrada: item.huella_entrada,
        verificacion: item.verificacion ? { estado: item.verificacion.estado, nivel: item.verificacion.nivel, huella: item.verificacion.huella,
          pruebas: (item.verificacion.pruebas || []).map((check) => ({ paso: check.paso, resultado: check.resultado })) } : null })),
      archivos: [...byPath.values()].map((item) => ({ ruta: item.ruta, huella: item.huella || crypto.createHash('sha256').update(item.contenido).digest('hex') }))
    };
    byPath.set('DELIVERY.md', { ruta: 'DELIVERY.md', lenguaje: 'markdown', contenido: this._readme(proyecto.nombre, artifacts, byPath.has('mobile/package.json')) +
      `\n## Actualización segura\n\nNo extraigas el ZIP encima de una entrega modificada. Extrae la nueva versión aparte. Desde la raíz de la entrega anterior ejecuta \`node tools/update.cjs --from RUTA_NUEVA\`: muestra cambios y conflictos sin escribir. Revisa el resultado y usa \`--apply --approve HASH\` con la aprobación mostrada. Cambios manuales concurrentes se bloquean; se conservan archivos retirados y se guardan respaldos en .icase/backups. No modifica .env, datos, node_modules ni .git. No reemplaza un control de versiones ni backups de base de datos. Las migraciones admitidas son aditivas; cambios destructivos o restricciones que requieran backfill se rechazan. Nunca uses down -v para actualizar.\n\n## Propietarios históricos\n\nSi activaste «Solo registros propios» sobre datos previos, \`node tools/backfill-owners.cjs\` muestra una vista previa (estrategias \`asignar_a_usuario\`, \`asignar_por_campo_email\`, \`dejar_null\`). Nada se escribe hasta \`--apply --approve HASH\`. Sin regla clara, deja \`owner_id\` en null.\n\n## Alcance declarado\n\nEntrega **${cobertura.modo_entrega}**. ${cobertura.semantica}\n\n${cobertura.bloqueos.map((item) => '- ' + item).join('\n')}\n` });
    byPath.set('.icase/baseline.json',{ruta:'.icase/baseline.json',lenguaje:'json',contenido:JSON.stringify({version:1,files:[...byPath.values()].map(({ruta,contenido})=>({ruta,contenido}))},null,2)});
    manifest.archivos=[...byPath.values()].map(item=>({ruta:item.ruta,huella:crypto.createHash('sha256').update(item.contenido).digest('hex')}));
    byPath.set('delivery-manifest.json', { ruta: 'delivery-manifest.json', lenguaje: 'json', contenido: JSON.stringify(manifest, null, 2) });
    const files = [...byPath.values()].map((file) => ({ ...file, huella: file.huella || crypto.createHash('sha256').update(file.contenido).digest('hex') }));
    return {
      archivos: files,
      dependencias: artifacts.map((item) => ({ tipo: item.tipo, version: item.version })),
      trazabilidad_rf: [...new Set(artifacts.flatMap((item) => item.trazabilidad_rf || []))],
      advertencias: [], versiones_origen: versionesOrigen,
      generado_por: 'generador_paquete_entrega_determinista_v1'
    };
  }

  _readme(name, artifacts, mobile = false) {
    return `# ${name}\n\nPaquete generado por I-CASE a partir de artefactos aprobados y verificados.\n\n${artifacts.map((item) => `- ${item.tipo}: versión ${item.version}`).join('\n')}\n\n## Inicio rápido\n\n1. Revisa \`delivery-manifest.json\` y la evidencia de verificación de cada artefacto.\n2. Configura \`ops/.env\` desde \`ops/.env.example\`.\n3. Ejecuta \`docker compose -f ops/docker-compose.yml up --build\`.\n4. Consulta los detalles de pruebas y CI/CD en sus respectivos README.\n5. La API está documentada en \`backend/openapi.json\` (OpenAPI 3.1), \`GET /api/openapi.json\` y el explorador en \`GET /api/docs\`.\n6. Lee \`backend/GENERATION-REPORT.md\`: indica qué se generó completo de cada requisito, qué quedó solo con datos y qué no se generó.\n${mobile ? '7. Para la app móvil, configura `mobile/.env` desde `mobile/.env.example` con una URL accesible desde el dispositivo y sigue `mobile/README.md`. El bundle Expo no es un APK/IPA firmado.\n' : ''}`;
  }
}

module.exports = DeliveryPackageGenerator;
