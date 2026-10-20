const crypto = require('crypto');
const IGeneradorArtefacto = require('../../core/services/IGeneradorArtefacto');

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
    const manifest = {
      proyecto: proyecto.nombre,
      generado_en: new Date().toISOString(),
      artefactos: artifacts.map((item) => ({ tipo: item.tipo, version: item.version, huella_entrada: item.huella_entrada,
        verificacion: item.verificacion ? { estado: item.verificacion.estado, nivel: item.verificacion.nivel, huella: item.verificacion.huella,
          pruebas: (item.verificacion.pruebas || []).map((check) => ({ paso: check.paso, resultado: check.resultado })) } : null })),
      archivos: [...byPath.values()].map((item) => ({ ruta: item.ruta, huella: item.huella || crypto.createHash('sha256').update(item.contenido).digest('hex') }))
    };
    byPath.set('DELIVERY.md', { ruta: 'DELIVERY.md', lenguaje: 'markdown', contenido: this._readme(proyecto.nombre, artifacts, byPath.has('mobile/package.json')) });
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
    return `# ${name}\n\nPaquete generado por I-CASE a partir de artefactos aprobados y verificados.\n\n${artifacts.map((item) => `- ${item.tipo}: versión ${item.version}`).join('\n')}\n\n## Inicio rápido\n\n1. Revisa \`delivery-manifest.json\` y la evidencia de verificación de cada artefacto.\n2. Configura \`ops/.env\` desde \`ops/.env.example\`.\n3. Ejecuta \`docker compose -f ops/docker-compose.yml up --build\`.\n4. Consulta los detalles de pruebas y CI/CD en sus respectivos README.\n5. La API está documentada en \`backend/openapi.json\` (OpenAPI 3.1; ábrelo en Swagger UI o Redoc) y, con el servicio en marcha, en \`GET /api/openapi.json\`.\n${mobile ? '6. Para la app móvil, configura `mobile/.env` desde `mobile/.env.example` con una URL accesible desde el dispositivo y sigue `mobile/README.md`. El bundle Expo no es un APK/IPA firmado.\n' : ''}`;
  }
}

module.exports = DeliveryPackageGenerator;
