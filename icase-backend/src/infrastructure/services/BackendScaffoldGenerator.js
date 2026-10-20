const crypto = require('crypto');
const IGeneradorArtefacto = require('../../core/services/IGeneradorArtefacto');
const GenericBackendGenerator = require('./GenericBackendGenerator');
const DomainModelExtractor = require('./DomainModelExtractor');
const BusinessRuleService = require('../../core/services/BusinessRuleService');
const AccessControlService = require('../../core/services/AccessControlService');
const GenerationReportService = require('../../core/services/GenerationReportService');
const ModuleService = require('../../core/services/ModuleService');

const slug = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'modulo';

class BackendScaffoldGenerator extends IGeneradorArtefacto {
  async generar({ proyecto, insumos, versionesOrigen }) {
    const { decisiones, requerimientos, diagramaDominio } = insumos;
    const stack = decisiones.stack_tecnologico || {};
    const arquitectura = decisiones.arquitectura_codigo || {};
    const rf = requerimientos.filter((item) => item.aprobado && item.tipo === 'RF');
    const modulos = [...new Set(rf.map((item) => slug(item.nombre)))].slice(0, 12);
    const domainModel = diagramaDominio?.codigo_plantuml ? new DomainModelExtractor().extract(diagramaDominio.codigo_plantuml) : null;
    const { reglas, descartadas } = this._reglas(decisiones.reglas_negocio?.reglas, domainModel, rf);
    const access = this._acceso(decisiones.control_acceso, rf);
    const generados = new GenericBackendGenerator().generate({ proyecto, requirements: rf, stack, domainModel, rules: reglas, access });
    const informe = this._informe({ proyecto, insumos, decisiones, archivos: generados });
    const archivos = [
      ...generados,
      { ruta: 'backend/GENERATION-REPORT.json', lenguaje: 'json', contenido: `${JSON.stringify(informe, null, 2)}\n` },
      { ruta: 'backend/GENERATION-REPORT.md', lenguaje: 'markdown', contenido: new GenerationReportService().toMarkdown(informe) }
    ];

    return {
      archivos: archivos.map((archivo) => ({
        ...archivo,
        huella: crypto.createHash('sha256').update(archivo.contenido).digest('hex')
      })),
      trazabilidad_rf: rf.map((item) => item.identificador),
      advertencias: [
        'Se generó una base CRUD ejecutable para cada RF. Las reglas específicas del dominio deben quedar expresadas en contratos y pruebas antes de considerar completa su semántica.',
        ...(domainModel ? this._modelWarnings(archivos) : ['No hay un diagrama de clases de dominio aprobado; los RF usan un esquema genérico sin campos.']),
        access?.autenticacion?.metodo === 'jwt'
          ? `Autenticación JWT con ${access.roles.filter((rol) => rol.incluir).length} roles de negocio más el administrador; define JWT_SECRET, ADMIN_EMAIL y ADMIN_PASSWORD antes de producción.`
          : 'La API se generó SIN autenticación, por decisión aprobada en la etapa de control de acceso.',
        `Reglas de negocio aplicadas: ${reglas.length}${descartadas ? `; ${descartadas} rechazadas por el usuario no se generaron` : ''}.`,
        `Informe de generación: ${informe.resumen.completo} requisitos completos, ${informe.resumen.solo_datos} solo con datos y ${informe.resumen.no_soportado} no soportados (ver backend/GENERATION-REPORT.md).`
      ],
      versiones_origen: versionesOrigen,
      generado_por: 'generador_backend_generico_v2'
    };
  }

  /** Qué se generó de cada RF; sale del contrato que ya viaja en el manifiesto, sin volver a derivarlo. */
  _informe({ proyecto, insumos, decisiones, archivos }) {
    const manifest = JSON.parse(archivos.find((item) => item.ruta === 'backend/icase.manifest.json').contenido);
    const aprobados = insumos.requerimientos.filter((item) => item.aprobado);
    const plataformas = [...(decisiones.alcance_plataforma?.plataformas || []), ...(decisiones.stack_tecnologico?.plataformas || [])];
    const modules = new ModuleService();
    const activos = modules.activos(decisiones.modulos);
    return new GenerationReportService().build({
      proyecto, requisitos: aprobados, contrato: manifest, stack: decisiones.stack_tecnologico || {}, plataformas,
      modulos: {
        modo: decisiones.modulos ? (decisiones.modulos.modo || 'automatico') : 'automatico',
        incluidos: modules.incluidos(decisiones).filter((item) => item.activo),
        opcionales: ModuleService.opcionales().map((item) => ({ id: item.id, etiqueta: item.etiqueta, activo: activos.includes(item.id) }))
      }
    });
  }

  /** La política aprobada debe seguir siendo coherente con los RF; si no, la generación falla. */
  _acceso(propuesta, rf) {
    if (!propuesta || !Object.keys(propuesta).length) return null;
    const { propuesta: normalizada, errores } = new AccessControlService().validar(propuesta, { requerimientos: rf });
    if (errores.length) throw new Error(`La política de acceso aprobada ya no es coherente con los requisitos: ${errores.join(' ')} Vuelve a revisar la etapa de autenticación y roles.`);
    return normalizada;
  }

  /** Solo las reglas confirmadas llegan al código; si no son coherentes con el modelo aprobado, la generación falla. */
  _reglas(propuestas, domainModel, rf) {
    if (!Array.isArray(propuestas) || !propuestas.length) return { reglas: [], descartadas: 0 };
    if (!domainModel) throw new Error('Hay reglas de negocio aprobadas, pero no existe un diagrama de dominio aprobado y vigente que las respalde.');
    const service = new BusinessRuleService();
    const { reglas, errores } = service.validar(propuestas, { entidades: domainModel.entities, requerimientos: rf });
    if (errores.length) throw new Error(`Las reglas de negocio aprobadas ya no son coherentes con el modelo de dominio: ${errores.join(' ')} Vuelve a revisar la etapa de reglas de negocio.`);
    const pendientes = service.pendientes(reglas);
    if (pendientes.length) throw new Error(`Hay reglas de negocio pendientes de decisión: ${pendientes.join(', ')}.`);
    return { reglas: service.confirmadas(reglas), descartadas: reglas.length - service.confirmadas(reglas).length };
  }

  _modelWarnings(archivos) {
    const manifest = JSON.parse(archivos.find((item) => item.ruta === 'backend/icase.manifest.json').contenido);
    return [
      ...(manifest.model.unmapped.length ? [`Entidades del dominio sin RF asociado: ${manifest.model.unmapped.join(', ')}.`] : []),
      ...manifest.warnings
    ];
  }

  _packageJson(nombre, dependencies, devDependencies = {}) {
    return JSON.stringify({
      name: slug(nombre), version: '0.1.0', private: true,
      scripts: { start: 'node src/main.js', dev: 'node --watch src/main.js', test: 'node --test' },
      dependencies, devDependencies
    }, null, 2);
  }

  _manifest(proyecto, stack, arquitectura, rf) {
    return JSON.stringify({
      proyecto: proyecto.nombre,
      generado_desde: { stack, arquitectura },
      requisitos: rf.map((item) => ({ id: item.identificador, nombre: item.nombre }))
    }, null, 2);
  }

  _express({ proyecto, stack, arquitectura, rf, modulos }) {
    const routes = modulos.map((item) => `router.use('/${item}', require('./modules/${item}/${item}.routes'));`).join('\n');
    const files = [
      { ruta: 'backend/package.json', lenguaje: 'json', contenido: this._packageJson(proyecto.nombre, { cors: '^2.8.5', dotenv: '^16.4.7', express: '^4.21.2' }) },
      { ruta: 'backend/src/app.js', lenguaje: 'javascript', contenido: `const express = require('express');\nconst cors = require('cors');\nconst router = require('./routes');\n\nconst app = express();\napp.use(cors());\napp.use(express.json());\napp.get('/health', (_req, res) => res.json({ status: 'ok' }));\napp.use('/api', router);\n\nmodule.exports = app;\n` },
      { ruta: 'backend/src/main.js', lenguaje: 'javascript', contenido: `require('dotenv').config();\nconst app = require('./app');\nconst port = Number(process.env.PORT || 3000);\napp.listen(port, () => console.log(\`API listening on port \${port}\`));\n` },
      { ruta: 'backend/src/routes.js', lenguaje: 'javascript', contenido: `const router = require('express').Router();\n${routes}\nmodule.exports = router;\n` },
      { ruta: 'backend/.env.example', lenguaje: 'dotenv', contenido: 'PORT=3000\nDATABASE_URL=\nJWT_SECRET=change-me\n' },
      { ruta: 'backend/icase.manifest.json', lenguaje: 'json', contenido: this._manifest(proyecto, stack, arquitectura, rf) }
    ];
    for (const moduleName of modulos) {
      files.push({ ruta: `backend/src/modules/${moduleName}/${moduleName}.routes.js`, lenguaje: 'javascript', contenido: `const router = require('express').Router();\n\n// TODO: implementar casos de uso trazados en icase.manifest.json\nrouter.get('/', (_req, res) => res.status(501).json({ module: '${moduleName}', status: 'pending' }));\n\nmodule.exports = router;\n` });
    }
    return files;
  }

  _nest({ proyecto, stack, arquitectura, rf, modulos }) {
    const imports = modulos.map((item) => `import { ${this._className(item)}Module } from './modules/${item}/${item}.module';`).join('\n');
    const moduleRefs = modulos.map((item) => `${this._className(item)}Module`).join(', ');
    const files = [
      { ruta: 'backend/package.json', lenguaje: 'json', contenido: JSON.stringify({ name: slug(proyecto.nombre), version: '0.1.0', private: true, scripts: { build: 'tsc', start: 'node dist/main.js', dev: 'ts-node src/main.ts', test: 'node --test' }, dependencies: { '@nestjs/common': '^10.0.0', '@nestjs/core': '^10.0.0', '@nestjs/platform-express': '^10.0.0', 'reflect-metadata': '^0.2.0', rxjs: '^7.8.0' }, devDependencies: { '@types/node': '^22.0.0', 'ts-node': '^10.9.0', typescript: '^5.0.0' } }, null, 2) },
      { ruta: 'backend/src/main.ts', lenguaje: 'typescript', contenido: `import { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\n\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  await app.listen(Number(process.env.PORT || 3000));\n}\nbootstrap();\n` },
      { ruta: 'backend/src/app.module.ts', lenguaje: 'typescript', contenido: `${imports}\nimport { Module } from '@nestjs/common';\nimport { HealthController } from './health.controller';\n\n@Module({ imports: [${moduleRefs}], controllers: [HealthController] })\nexport class AppModule {}\n` },
      { ruta: 'backend/src/health.controller.ts', lenguaje: 'typescript', contenido: "import { Controller, Get } from '@nestjs/common';\n\n@Controller('health')\nexport class HealthController {\n  @Get() check() { return { status: 'ok' }; }\n}\n" },
      { ruta: 'backend/tsconfig.json', lenguaje: 'json', contenido: JSON.stringify({ compilerOptions: { module: 'commonjs', target: 'ES2022', experimentalDecorators: true, emitDecoratorMetadata: true, strict: true, outDir: './dist' }, include: ['src/**/*.ts'] }, null, 2) },
      { ruta: 'backend/.env.example', lenguaje: 'dotenv', contenido: 'PORT=3000\nDATABASE_URL=\nJWT_SECRET=change-me\n' },
      { ruta: 'backend/icase.manifest.json', lenguaje: 'json', contenido: this._manifest(proyecto, stack, arquitectura, rf) }
    ];
    for (const moduleName of modulos) {
      const className = this._className(moduleName);
      files.push({ ruta: `backend/src/modules/${moduleName}/${moduleName}.module.ts`, lenguaje: 'typescript', contenido: `import { Module } from '@nestjs/common';\n\n@Module({})\nexport class ${className}Module {}\n` });
    }
    return files;
  }

  _className(value) {
    return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  }
}

module.exports = BackendScaffoldGenerator;
