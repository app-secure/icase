const crypto = require('crypto');
const IGeneradorArtefacto = require('../../core/services/IGeneradorArtefacto');
const GenericBackendGenerator = require('./GenericBackendGenerator');

const slug = (value) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'modulo';

class BackendScaffoldGenerator extends IGeneradorArtefacto {
  async generar({ proyecto, insumos, versionesOrigen }) {
    const { decisiones, requerimientos } = insumos;
    const stack = decisiones.stack_tecnologico || {};
    const arquitectura = decisiones.arquitectura_codigo || {};
    const rf = requerimientos.filter((item) => item.aprobado && item.tipo === 'RF');
    const modulos = [...new Set(rf.map((item) => slug(item.nombre)))].slice(0, 12);
    const archivos = new GenericBackendGenerator().generate({ proyecto, requirements: rf, stack });

    return {
      archivos: archivos.map((archivo) => ({
        ...archivo,
        huella: crypto.createHash('sha256').update(archivo.contenido).digest('hex')
      })),
      trazabilidad_rf: rf.map((item) => item.identificador),
      advertencias: ['Se generó una base CRUD ejecutable para cada RF. Las reglas específicas del dominio deben quedar expresadas en contratos y pruebas antes de considerar completa su semántica.'],
      versiones_origen: versionesOrigen,
      generado_por: 'generador_backend_generico_v2'
    };
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
