const crypto = require('crypto');

class ArtifactVerificationService {
  verificar(artefacto) {
    const files = new Map((artefacto.archivos || []).map((file) => [file.ruta, String(file.contenido || '')]));
    const text = [...files.values()].join('\n');
    const errores = [];
    const advertencias = [];
    const requireFile = (path) => {
      if (!files.has(path)) errores.push(`Falta el archivo ${path}.`);
    };
    const requireJson = (path) => {
      requireFile(path);
      if (files.has(path)) {
        try { JSON.parse(files.get(path)); }
        catch { errores.push(`${path} no contiene JSON válido.`); }
      }
    };

    switch (artefacto.tipo) {
      case 'codigo_backend': {
        requireJson('backend/package.json');
        requireJson('backend/icase.manifest.json');
        const sources = [...files].filter(([path]) => /^backend\/src\//.test(path));
        if (!sources.some(([path, content]) => !/health/i.test(path) && /(?:@Controller\(|(?:router|app)\.(?:get|post|put|patch|delete)\()/i.test(content) && !/^\s*(?:\/\/\s*)?@Controller\(['"]health['"]\)/im.test(content))) {
          errores.push('El backend no expone operaciones de negocio; solo health no basta.');
        }
        if (/TODO:\s*implementar|status:\s*['"]pending['"]|\.status\(501\)/i.test(text)) {
          errores.push('El backend contiene operaciones pendientes o respuestas HTTP 501.');
        }
        if (sources.some(([path, content]) => /\.module\.ts$/.test(path) && /@Module\(\{\s*\}\)/.test(content))) {
          errores.push('Hay módulos NestJS vacíos sin controladores ni proveedores.');
        }
        if (/postgres/i.test(text) && !/(?:\bpg\b|prisma|typeorm|sequelize|knex)/i.test(files.get('backend/package.json') || '')) {
          errores.push('Se declara PostgreSQL, pero el backend no incluye un controlador de base de datos.');
        }
        try {
          const manifest = JSON.parse(files.get('backend/icase.manifest.json') || '{}');
          if (!Array.isArray(manifest.operations) || !manifest.operations.length) errores.push('El contrato del backend no declara operaciones derivadas de los RF.');
          for (const operation of manifest.operations || []) {
            if (!operation.id || !operation.key || !operation.collectionPath) errores.push('Hay una operación sin RF, clave o ruta de colección.');
            if (!['GET', 'POST', 'PATCH', 'DELETE'].every((method) => (operation.methods || []).includes(method))) errores.push(`La operación ${operation.id || operation.key} no ofrece un ciclo CRUD verificable.`);
          }
        } catch { /* requireJson ya registra el error. */ }
        break;
      }
      case 'codigo_frontend': {
        requireJson('frontend/package.json');
        requireFile('frontend/src/App.jsx');
        const pages = [...files].filter(([path]) => /^frontend\/src\/pages\/.*\.(?:jsx|tsx)$/.test(path));
        if (!pages.length) errores.push('El frontend no contiene pantallas.');
        if (pages.some(([, content]) => /dangerouslySetInnerHTML/.test(content))) {
          errores.push('Las pantallas solo incrustan HTML de mockups; no son componentes interactivos conectados al backend.');
        }
        if (![...files].some(([path, content]) => /^frontend\/src\//.test(path) && /\bfetch\s*\(|\baxios\b|useMutation|useQuery/.test(content))) {
          errores.push('Ninguna pantalla consume una API del backend.');
        }
        try {
          const manifest = JSON.parse(files.get('frontend/icase.manifest.json') || '{}');
          const disconnected = (manifest.pantallas || []).filter((screen) => !(screen.operations || []).length);
          if (disconnected.length) errores.push(`Hay pantallas sin operaciones RF conectadas: ${disconnected.map((item) => item.name || item.nombre || item.id).join(', ')}.`);
          if ((manifest.plataformas_solicitadas || []).some((item) => /m[oó]vil|android|ios|react native/i.test(item)) && !files.has('mobile/package.json')) {
            errores.push('El alcance aprobado incluye una aplicación móvil, pero no se generó un proyecto React Native.');
          }
        } catch { errores.push('El manifiesto de frontend no es válido.'); }
        break;
      }
      case 'pruebas': {
        requireJson('tests/package.json');
        const testFiles = [...files].filter(([path]) => /^tests\/.*\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path));
        if (!testFiles.some(([, content]) => /\b(?:post|put|patch|delete)\b|method:\s*['"](?:POST|PUT|PATCH|DELETE)/i.test(content))) {
          errores.push('Las pruebas no ejercitan ninguna operación de escritura del negocio.');
        }
        if (!testFiles.some(([, content]) => /\.click\(|\.fill\(|\.submit\(/.test(content))) {
          errores.push('Las pruebas de navegador no verifican interacciones de usuario.');
        }
        break;
      }
      case 'infraestructura': {
        requireFile('ops/docker-compose.yml');
        requireFile('ops/docker/backend.Dockerfile');
        requireFile('ops/docker/frontend.Dockerfile');
        if (files.has('ops/docker-compose.ha.yml') && !/replicas:\s*[2-9]/.test(files.get('ops/docker-compose.ha.yml'))) {
          errores.push('El perfil de alta disponibilidad no define réplicas.');
        }
        if (files.has('ops/docker-compose.ha.yml') && /ports:\s*\n\s*-\s*["']?\$\{API_PORT/.test(files.get('ops/docker-compose.yml') || '')) {
          errores.push('El perfil HA mantiene un puerto fijo del backend; dos réplicas no pueden vincularlo simultáneamente.');
        }
        break;
      }
      case 'pipeline_ci_cd': {
        const workflow = files.get('.github/workflows/ci-cd.yml') || '';
        if (!workflow) errores.push('Falta el pipeline CI/CD.');
        if (!/npm (?:ci|install)/.test(workflow) || !/npm (?:run build|test)/.test(workflow)) {
          errores.push('El pipeline no instala, compila y ejecuta pruebas.');
        }
        if (/docker compose/.test(workflow) && !/DB_NAME:|--env-file|env_file:/.test(workflow)) {
          errores.push('El pipeline inicia Docker Compose sin configurar las variables obligatorias de la base de datos.');
        }
        break;
      }
      case 'paquete_entrega': {
        for (const path of ['backend/package.json', 'frontend/package.json', 'tests/package.json', 'ops/docker-compose.yml', 'delivery-manifest.json']) requireFile(path);
        requireJson('delivery-manifest.json');
        break;
      }
      default:
        errores.push(`Tipo de artefacto no verificable: ${artefacto.tipo}.`);
    }

    for (const [path, content] of files) {
      if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\')) errores.push(`Ruta de archivo no segura: ${path}.`);
      if (!content.trim()) advertencias.push(`Archivo vacío: ${path}.`);
    }
    const huella = crypto.createHash('sha256').update(JSON.stringify([...files])).digest('hex');
    return { estado: errores.length ? 'fallida' : 'apta_estructuralmente', nivel: 'estatico', huella, errores, advertencias,
      nota: 'Esta revisión no ejecuta dependencias ni demuestra que el sistema funcione. Requiere compilación y pruebas de integración en CI antes de considerarse ejecutable.' };
  }
}

module.exports = ArtifactVerificationService;
