const ApplicationContractBuilder = require('./ApplicationContractBuilder');
const fs = require('node:fs');
const path = require('node:path');
const BackendDataLayerGenerator = require('./BackendDataLayerGenerator');
const AccessControlService = require('../../core/services/AccessControlService');
const StackCatalog = require('../../core/services/StackCatalog');
const OpenApiGenerator = require('./OpenApiGenerator');
const NestRuntimePolicy = require('../../core/services/NestRuntimePolicy');
const ChangeEventsGenerator = require('./ChangeEventsGenerator');

const AUTH_TEMPLATES = path.join(__dirname, '..', 'templates', 'auth');
const SPRING_TEMPLATES = path.join(__dirname, '..', 'templates', 'spring');
const renderTemplate = require('./renderTemplate');

const slug = (value) => String(value || 'project').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

class GenericBackendGenerator {
  generate({ proyecto, requirements, stack, domainModel = null, rules = [], access = null, modules = null }) {
    if(modules?.modo==='personalizado'&&modules.modulos?.some(item=>item.id==='procesos_negocio'&&item.activo)){
      const result=new (require('../../core/services/ModuleService'))().validar(modules);
      if(result.errores.length)throw new Error('Procesos de negocio: '+result.errores.join(' '));
    }
    const contract = new ApplicationContractBuilder().build({ proyecto, requerimientos: requirements, domainModel, rules });
    const policy = new AccessControlService().politica(access, contract.operations);
    contract.auth = policy;
    const resolved = StackCatalog.resolve(stack);
    const ownership = require('../templates/auth/ownership');
    if (ownership.policyUsesOwnership(policy)) {
      const activos = new (require('../../core/services/ModuleService'))().activos(modules);
      const blocked = ownership.BLOCKED_MODULES.filter((id) => activos.includes(id));
      if (blocked.length) throw new Error('La propiedad de registros no se puede combinar con: ' + blocked.join(', ') + '.');
    }
    if(resolved.backend==='spring'&&rules.some(rule=>rule.tipo==='calculo')) throw new Error('Los cálculos declarativos aún no soportan Spring.');
    for(const operation of contract.operations) for(const rule of operation.rules.filter(rule=>rule.tipo==='calculo')) if(operation.schema?.properties?.[rule.campo]) operation.schema.properties[rule.campo].readOnly=true;
    const database = resolved.database;
    const data = new BackendDataLayerGenerator().build({ contract, database, policy, modules });
    const associationApi = true;
    for (const item of data.model.associations || []) {
      item.endpoints_generated = associationApi;
      if (database === 'mongodb') item.requires_replica_set = true;
    }
    contract.associations = (data.model.associations || []).map((item) => ({ ...item,
      operations: item.entities.map((name) => contract.operations.filter((operation) => operation.entity === contract.entities.find((entity) => entity.name === name)?.key).map((operation) => operation.key))
    }));
    const modelFile = data.files.shared.find((file) => file.ruta === 'backend/src/data/model.js');
    if (modelFile) modelFile.contenido = `module.exports = ${JSON.stringify(data.model, null, 2)};\n`;
    const openapi = new OpenApiGenerator().build({ proyecto, contract, model: data.model, policy });
    if (associationApi && data.model.associations.length) {
      const idPattern = database === 'mongodb' ? '^[a-fA-F0-9]{24}$' : '^[1-9][0-9]{0,18}$';
      const pair = { type: 'object', additionalProperties: false, required: ['source_id', 'target_id'], properties: { source_id: { type: 'string', pattern: idPattern }, target_id: { type: 'string', pattern: idPattern } } };
      for (const item of data.model.associations) {
        const responses = { 200: { description: 'Operación completada; asociación y desasociación idempotentes.' }, 400: { description: 'Datos inválidos' }, 401: { description: 'Sesión requerida si está habilitada' }, 403: { description: 'Sin permisos sobre ambos extremos' }, 404: { description: 'Relación o extremo inexistente' }, 409: { description: 'Conflicto referencial' }, 429: { description: 'Límite HTTP excedido' } };
        if (database === 'mongodb') responses[503] = { description: 'El servidor no soporta las transacciones requeridas; configura un replica set.' };
        openapi.paths['/api/associations/' + item.table] = {
          get: { summary: 'Listar vínculos de ' + item.entities.join(' / '), description: 'Requiere GET en ambos extremos. Lista desde source_id, máximo 100 resultados; has_more indica otra página. Continúa con after_target_id igual al último target_id recibido.', parameters: [{ name: 'source_id', in: 'query', required: true, schema: pair.properties.source_id }, { name: 'after_target_id', in: 'query', schema: pair.properties.target_id }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } }], responses },
          post: { summary: 'Asociar registros', description: 'Requiere GET y PATCH sobre ambos extremos o administrador.', requestBody: { required: true, content: { 'application/json': { schema: pair } } }, responses },
          delete: { summary: 'Desasociar registros sin borrarlos', description: 'Requiere GET y PATCH sobre ambos extremos o administrador.', requestBody: { required: true, content: { 'application/json': { schema: pair } } }, responses }
        };
      }
    }
    data.files.shared.push(
      { ruta: 'backend/src/security/http-security.js', lenguaje: 'javascript', contenido: fs.readFileSync(path.join(AUTH_TEMPLATES, 'http-security.js'), 'utf8') },
      { ruta: 'backend/openapi.json', lenguaje: 'json', contenido: `${JSON.stringify(openapi, null, 2)}\n` },
      { ruta: 'backend/src/docs/openapi.js', lenguaje: 'javascript', contenido: `module.exports = ${JSON.stringify(openapi)};\n` },
      { ruta: 'backend/src/docs/swagger-ui.js', lenguaje: 'javascript', contenido: fs.readFileSync(path.join(AUTH_TEMPLATES, 'swagger-ui.js'), 'utf8') }
    );
    const events = new ChangeEventsGenerator();
    if (resolved.backend === 'spring') {
      if(new (require('../../core/services/ModuleService'))().activos(modules).includes('procesos_negocio'))throw new Error('Procesos transaccionales aún no soportan Spring.');
      if(new (require('../../core/services/ModuleService'))().activos(modules).some(id=>['pagos_prueba','sso_oidc','mapas','camara_qr'].includes(id)))throw new Error('Integraciones especializadas aún no soportan Spring.');
      if (new (require('../../core/services/ModuleService'))().activos(modules).some(id=>['archivos_imagenes','reportes_calculos','recuperacion_cuentas'].includes(id))) throw new Error('Archivos/reportes/recuperación aún no soportan Spring.');
      if (events.enabled(modules)) throw new Error('Eventos de cambios experimental aún no soporta Spring.');
      return this._spring(proyecto, contract, resolved, data, policy);
    }
    const generated = resolved.backend === 'nest'
      ? this._nest(proyecto, contract, database, data, policy, resolved)
      : this._express(proyecto, contract, database, data, policy, resolved);
    const withEvents = events.enabled(modules) ? events.apply(generated, { resolved, policy, contract,modules }) : generated;
    const extended=new (require('./GeneratedExtensionsGenerator'))().apply(withEvents,{resolved,policy,contract,modules});
    const integrated=new (require('./SpecializedIntegrationsGenerator'))().apply(extended,{resolved,policy,contract,modules});
    return new (require('./BusinessProcessGenerator'))().apply(integrated,{resolved,policy,contract,modules,requirements});
  }

  _authFiles(policy, adapter) {
    if (!policy.habilitada) return [];
    const read = (name) => fs.readFileSync(path.join(AUTH_TEMPLATES, name), 'utf8');
    return [
      { ruta: 'backend/src/auth/policy.js', lenguaje: 'javascript', contenido: `module.exports = ${JSON.stringify(policy, null, 2)};\n` },
      { ruta: 'backend/src/auth/ownership.js', lenguaje: 'javascript', contenido: read('ownership.js') },
      { ruta: 'backend/src/auth/auth-core.js', lenguaje: 'javascript', contenido: read('auth-core.js') },
      ...(adapter === 'express' ? [{ ruta: 'backend/src/auth/auth-express.js', lenguaje: 'javascript', contenido: read('auth-express.js') }] : [])
    ];
  }

  _manifest(project, contract, database, data, resolved = { backend: 'express', language: 'node' }) {
    const tables = Object.entries(data.model.tables).map(([name, table]) => ({ name, entity: table.entity, columns: table.columns.map((column) => column.column), references: table.references }));
    return JSON.stringify({
      ...contract,
      database,
      stack: { backend: resolved.backend, lenguaje: resolved.language, ...(resolved.backend === 'nest' ? { version_framework: NestRuntimePolicy.version, node: NestRuntimePolicy.node } : {}) },
      mode: contract.entities.length ? 'entity_crud_v1' : 'generic_crud_v1',
      docs: { openapi: '/api/openapi.json', docs: '/api/docs', archivo: 'backend/openapi.json' },
      storage: { layout: 'table_per_entity', operations: data.model.operations, tables, associations: data.model.associations || [], migrations: data.migrations.map((item) => item.id) },
      requisitos: contract.operations.map((item) => ({ id: item.id, nombre: item.name })),
      endpoints: contract.operations.flatMap((item) => [item.collectionPath, item.itemPath])
    }, null, 2);
  }

  _dependencies(database, nest = false, auth = false) {
    return {
      helmet: '^8.0.0', 'express-rate-limit': '^7.5.0', cors: '^2.8.5', 'swagger-ui-dist': '5.18.2',
      ...(auth ? { jsonwebtoken: '^9.0.3' } : {}),
      ...(nest ? { '@nestjs/common': NestRuntimePolicy.version, '@nestjs/core': NestRuntimePolicy.version, '@nestjs/platform-express': NestRuntimePolicy.version, 'reflect-metadata': '^0.2.0', rxjs: '^7.8.0' } : { cors: '^2.8.5', dotenv: '^16.4.7', express: '^4.21.2' }),
      ...(database === 'postgres' ? { pg: '^8.13.0' } : database === 'mysql' ? { mysql2: '^3.11.0' } : { mongodb: '^6.12.0' })
    };
  }

  _nest(project, contract, database, data, policy, resolved) {
    const packageJson = { name: `${slug(project.nombre)}-backend`, version: '1.0.0', private: true, engines: { node: NestRuntimePolicy.node }, scripts: { build: 'tsc', start: 'node dist/main.js', dev: 'ts-node src/main.ts', test: 'node --test' }, dependencies: this._dependencies(database, true, policy.habilitada), devDependencies: { '@types/express': '^5.0.0', '@types/node': '^22.0.0', '@types/pg': '^8.11.0', 'ts-node': '^10.9.0', typescript: '^5.0.0' } };
    return [
      { ruta: 'backend/package.json', lenguaje: 'json', contenido: JSON.stringify(packageJson, null, 2) },
      { ruta: 'backend/tsconfig.json', lenguaje: 'json', contenido: JSON.stringify({ compilerOptions: { module: 'commonjs', target: 'ES2022', experimentalDecorators: true, emitDecoratorMetadata: true, strict: true, esModuleInterop: true, allowJs: true, outDir: './dist' }, include: ['src/**/*.ts', 'src/**/*.js'] }, null, 2) },
      { ruta: 'backend/.env.example', lenguaje: 'dotenv', contenido: this._env(database, policy) },
      { ruta: 'backend/icase.manifest.json', lenguaje: 'json', contenido: this._manifest(project, contract, database, data, resolved) },
      { ruta: 'backend/src/main.ts', lenguaje: 'typescript', contenido: "import 'reflect-metadata';\nimport { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\nimport { StoreExceptionFilter } from './store-exception.filter';\nconst express=require('express');\nconst configureHttpSecurity = require('./security/http-security');\nasync function bootstrap(){const app=await NestFactory.create(AppModule);const http=app.getHttpAdapter().getInstance();configureHttpSecurity(http);http.use('/api/docs/static',(req:any,res:any,next:any)=>{try{express.static(require('./docs/swagger-ui').absoluteAssetPath(),{index:false})(req,res,next);}catch(e){next(e);}});app.useGlobalFilters(new StoreExceptionFilter());await app.listen(Number(process.env.PORT||3000));}\nbootstrap();\n" },
      { ruta: 'backend/src/store-exception.filter.ts', lenguaje: 'typescript', contenido: this._nestFilter() },
      { ruta: 'backend/src/app.module.ts', lenguaje: 'typescript', contenido: this._nestModule(policy) },
      { ruta: 'backend/src/app.controller.ts', lenguaje: 'typescript', contenido: this._nestController(contract, policy) },
      { ruta: 'backend/src/record.store.ts', lenguaje: 'typescript', contenido: this._nestStore() },
      { ruta: 'backend/src/record.store.base.js', lenguaje: 'javascript', contenido: data.files.store },
      ...data.files.shared,
      ...this._authFiles(policy, 'nest'),
      ...(policy.habilitada ? [
        { ruta: 'backend/src/auth.service.ts', lenguaje: 'typescript', contenido: this._nestAuthService() },
        { ruta: 'backend/src/auth.guard.ts', lenguaje: 'typescript', contenido: this._nestAuthGuard() },
        { ruta: 'backend/src/auth.controller.ts', lenguaje: 'typescript', contenido: this._nestAuthController() }
      ] : []),
      ...contract.operations.map((item) => ({ ruta: `backend/src/modules/${item.key}/${item.key}.module.ts`, lenguaje: 'typescript', contenido: `// ${item.id}: ${item.name}\nexport const ${this._class(item.key)}Capability = ${JSON.stringify(item.key)};\n` }))
    ];
  }

  _express(project, contract, database, data, policy, resolved) {
    const packageJson = { name: `${slug(project.nombre)}-backend`, version: '1.0.0', private: true, scripts: { start: 'node src/main.js', dev: 'node --watch src/main.js', test: 'node --test' }, dependencies: this._dependencies(database, false, policy.habilitada) };
    return [
      { ruta: 'backend/package.json', lenguaje: 'json', contenido: JSON.stringify(packageJson, null, 2) },
      { ruta: 'backend/.env.example', lenguaje: 'dotenv', contenido: this._env(database, policy) },
      { ruta: 'backend/icase.manifest.json', lenguaje: 'json', contenido: this._manifest(project, contract, database, data, resolved) },
      { ruta: 'backend/src/main.js', lenguaje: 'javascript', contenido: "require('dotenv').config();\nconst app=require('./app');\nconst port=Number(process.env.PORT||3000);\napp.locals.init().then(()=>app.listen(port,()=>console.log('API listening on '+port))).catch((error)=>{console.error(error);process.exit(1)});\n" },
      { ruta: 'backend/src/app.js', lenguaje: 'javascript', contenido: this._expressApp(contract, policy) },
      { ruta: 'backend/src/record.store.js', lenguaje: 'javascript', contenido: data.files.store },
      ...data.files.shared,
      ...this._authFiles(policy, 'express'),
      ...contract.operations.map((item) => ({ ruta: `backend/src/modules/${item.key}/${item.key}.js`, lenguaje: 'javascript', contenido: `module.exports=${JSON.stringify(item, null, 2)};\n` }))
    ];
  }

  _nestModule(policy) {
    if (!policy.habilitada) return "import { Module } from '@nestjs/common';\nimport { AppController } from './app.controller';\nimport { RecordStore } from './record.store';\n@Module({controllers:[AppController],providers:[RecordStore]}) export class AppModule {}\n";
    return `import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { RecordStore } from './record.store';

@Module({
  controllers: [AppController, AuthController],
  providers: [RecordStore, AuthService, { provide: APP_GUARD, useClass: AuthGuard }]
})
export class AppModule {}
`;
  }

  _nestAuthService() {
    return `import { Injectable, OnModuleInit } from '@nestjs/common';
import { RecordStore } from './record.store';
// El núcleo es JavaScript compartido con la variante Express; se compila con allowJs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAuth } = require('./auth/auth-core.js');

@Injectable()
export class AuthService implements OnModuleInit {
  readonly core: any;
  constructor(private readonly store: RecordStore) { this.core = createAuth({ store }); }
  async onModuleInit() {
    await this.store.ensureReady();
    await this.core.init();
  }
}
`;
  }

  _nestAuthGuard() {
    return `import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path = String(request.originalUrl || request.url).split('?')[0];
    const core = this.auth.core;
    if (!path.startsWith('/api') || core.isPublic(request.method, path)) return true;
    request.user = await core.authenticate(request.headers.authorization);
    core.authorize(request.user, request.method, path);
    return true;
  }
}
`;
  }

  _nestAuthController() {
    return `import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('auth/login') @HttpCode(200) login(@Body() body: any, @Req() req: any) { return this.auth.core.login(body?.email, body?.password, req.ip); }
  @Post('auth/register') register(@Body() body: any, @Req() req: any) { return this.auth.core.register(body, req.ip); }
  @Get('auth/me') me(@Req() req: any) { return { usuario: this.auth.core.publicUser(req.user), permisos: this.auth.core.permissionsOf(req.user) }; }
  @Get('users') users() { return this.auth.core.users.list(); }
  @Post('users') createUser(@Body() body: any) { return this.auth.core.users.create(body); }
  @Patch('users/:id') async updateUser(@Param('id') id: string, @Body() body: any) {
    const user = await this.auth.core.users.update(id, body);
    if (!user) throw new NotFoundException('Usuario inexistente');
    return user;
  }
  @Delete('users/:id') async removeUser(@Param('id') id: string, @Req() req: any) {
    const removed = await this.auth.core.users.remove(id, req.user);
    if (!removed) throw new NotFoundException('Usuario inexistente');
    return { deleted: true, id };
  }
}
`;
  }

  /**
   * Backend Java + Spring Boot. El código Java es fijo y se guía por los mismos datos del contrato que la variante
   * Node (modelo, reglas, política y OpenAPI), que se escriben como JSON en src/main/resources/icase.
   */
  _spring(project, contract, resolved, data, policy) {
    const database = resolved.database;
    const read = (relative) => fs.readFileSync(path.join(SPRING_TEMPLATES, relative), 'utf8');
    const sources = fs.readdirSync(path.join(SPRING_TEMPLATES, 'src/main/java/app')).filter((name) => name.endsWith('.java')).sort();
    const driver = database === 'postgres'
      ? '    <dependency>\n      <groupId>org.postgresql</groupId>\n      <artifactId>postgresql</artifactId>\n      <scope>runtime</scope>\n    </dependency>\n    <dependency>\n      <groupId>org.flywaydb</groupId>\n      <artifactId>flyway-database-postgresql</artifactId>\n    </dependency>'
      : '    <dependency>\n      <groupId>com.mysql</groupId>\n      <artifactId>mysql-connector-j</artifactId>\n      <scope>runtime</scope>\n    </dependency>\n    <dependency>\n      <groupId>org.flywaydb</groupId>\n      <artifactId>flyway-mysql</artifactId>\n    </dependency>';
    const openapi = data.files.shared.find((file) => file.ruta === 'backend/openapi.json');
    const resource = (name, value) => ({ ruta: `backend/src/main/resources/icase/${name}.json`, lenguaje: 'json', contenido: `${JSON.stringify(value, null, 2)}\n` });
    const migrations = data.migrations.map((migration) => {
      const [, version, name] = /^(\d+)_(.+)$/.exec(migration.id);
      return { ruta: `backend/src/main/resources/db/migration/V${Number(version)}__${name}.sql`, lenguaje: 'sql', contenido: `-- Migración ${migration.id}: generada por I-CASE. Flyway la aplica al iniciar.\n\n${migration.statements.map((statement) => `${statement};`).join('\n\n')}\n` };
    });
    return [
      { ruta: 'backend/pom.xml', lenguaje: 'xml', contenido: renderTemplate(read('pom.xml'), { ARTIFACT: `${slug(project.nombre)}-backend`, DATABASE_DEPENDENCIES: driver }) },
      { ruta: 'backend/src/test/java/app/HttpSecurityFilterTest.java', lenguaje: 'java', contenido: read('HttpSecurityFilterTest.java') },
      { ruta: 'backend/src/test/java/app/AssociationStoreTest.java', lenguaje: 'java', contenido: read('AssociationStoreTest.java') },
      { ruta: 'backend/src/test/java/app/OwnershipAuthTest.java', lenguaje: 'java', contenido: read('OwnershipAuthTest.java') },
      { ruta: 'backend/README.md', lenguaje: 'markdown', contenido: this._springReadme(project, database, policy) },
      { ruta: 'backend/.gitignore', lenguaje: 'gitignore', contenido: 'target/\n.env\n' },
      { ruta: 'backend/.env.example', lenguaje: 'dotenv', contenido: this._env(database, policy, 'spring') },
      { ruta: 'backend/icase.manifest.json', lenguaje: 'json', contenido: this._manifest(project, contract, database, data, resolved) },
      { ruta: 'backend/src/main/resources/application.properties', lenguaje: 'properties', contenido: read('src/main/resources/application.properties') },
      ...sources.map((name) => ({ ruta: `backend/src/main/java/app/${name}`, lenguaje: 'java', contenido: read(`src/main/java/app/${name}`) })),
      resource('contract', contract), resource('model', data.model), resource('rules', data.rules), resource('policy', policy),
      { ruta: 'backend/src/main/resources/icase/openapi.json', lenguaje: 'json', contenido: openapi.contenido },
      ...migrations,
      openapi
    ];
  }

  _springReadme(project, database, policy) {
    return `# ${project.nombre}: backend (Java + Spring Boot)

API REST generada por I-CASE. El código Java es fijo y se guía por los datos de \`src/main/resources/icase/\`
(modelo, reglas de negocio y política de acceso aprobados); las migraciones de \`src/main/resources/db/migration/\`
las aplica Flyway al arrancar.

## Ejecutar

\`\`\`bash
mvn -B package
DATABASE_URL=${database === 'postgres' ? 'postgresql://app:clave@localhost:5432/app' : 'mysql://app:clave@localhost:3306/app'} ${policy.habilitada ? 'JWT_SECRET=<secreto> ADMIN_EMAIL=<correo> ADMIN_PASSWORD=<clave> ' : ''}java -jar target/app.jar
\`\`\`

Requiere Java 21. La documentación de la API está en \`openapi.json\`, \`GET /api/openapi.json\` y el explorador HTML en \`GET /api/docs\` (Swagger UI vía CDN; no es SpringDoc).
${policy.habilitada ? '\nCon \`APP_ENV=production\` se rechaza un \`JWT_SECRET\` débil (menos de 16 caracteres o con valores de ejemplo).\n' : ''}`;
  }

  _nestStore() {
    return `import { Injectable, OnModuleInit } from '@nestjs/common';
// El almacén es JavaScript compartido con la variante Express; se compila con allowJs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Base: any = require('./record.store.base.js');

@Injectable()
export class RecordStore extends Base implements OnModuleInit {
  private starting?: Promise<void>;
  // Idempotente: otros proveedores (autenticación) esperan a que las migraciones terminen.
  ensureReady(): Promise<void> { return this.starting || (this.starting = this.init()); }
  async onModuleInit() { await this.ensureReady(); }
}
`;
  }

  _nestFilter() {
    return `import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

@Catch()
export class StoreExceptionFilter implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (error instanceof HttpException) return response.status(error.getStatus()).json(error.getStatus() >= 500 ? { message: 'Error interno del servidor' } : error.getResponse());
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
    return response.status(status).json(status >= 500 ? { message: 'Error interno del servidor' } : { message: error?.message || 'Solicitud inválida', ...(error?.details ? { details: error.details } : {}) });
  }
}
`;
  }

  _nestController(contract, policy = { habilitada: false }) {
    const scoped = policy.habilitada
      ? "const {scopeOf}=require('./auth/ownership');const policy=require('./auth/policy');const scope=(user:any,key:string)=>scopeOf(policy,user,key);"
      : 'const scope=(_user:any,_key:string)=>null;';
    return `import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { RecordStore } from './record.store';
${scoped}
const allowed=new Set(${JSON.stringify(contract.operations.map((item) => item.key))});
const associations=require('./data/associations');
@Controller() export class AppController {
 constructor(private readonly store:RecordStore){}
 private capability(value:string){if(!allowed.has(value))throw new NotFoundException('Operación inexistente');return value;}
 @Get('health') async health(){await this.store.ping();return {status:'ok',database:'connected'};}
 @Get('api/contract') contract(){return ${JSON.stringify(contract)};}
 @Get('api/openapi.json') openapi(){return require('./docs/openapi.js');}
 @Get('api/docs') docs(@Res() res:any){res.type('html').send(require('./docs/swagger-ui').html());}
 @Get('api/associations/:relation') links(@Param('relation') relation:string,@Query() query:any){return associations(this.store,'list',relation,query);}
 @Post('api/associations/:relation') @HttpCode(200) link(@Param('relation') relation:string,@Body() body:any){return associations(this.store,'link',relation,body);}
 @Delete('api/associations/:relation') unlink(@Param('relation') relation:string,@Body() body:any){return associations(this.store,'unlink',relation,body);}
 @Get('api/operations/:capability') async list(@Param('capability') capability:string,@Query() query:any,@Req() req:any,@Res({passthrough:true}) res:any){
   const key=this.capability(capability);
   const result=await this.store.list(key,query,scope(req.user,key));
   if(result&&result.pagination){
     res.set({
       'X-Total-Count':String(result.pagination.total),
       'X-Page':String(result.pagination.page),
       'X-Limit':String(result.pagination.limit),
       'X-Total-Pages':String(result.pagination.total_pages)
     });
   }
   return result;
 }
 @Post('api/operations/:capability') create(@Param('capability') capability:string,@Body() body:any,@Req() req:any){if(!body||Array.isArray(body)||typeof body!=='object')throw new BadRequestException('El cuerpo debe ser un objeto');const key=this.capability(capability);return this.store.create(key,body,scope(req.user,key));}
 @Patch('api/operations/:capability/:id') async update(@Param('capability') capability:string,@Param('id') id:string,@Body() body:any,@Req() req:any){const key=this.capability(capability);const value=await this.store.update(key,id,body,scope(req.user,key));if(!value)throw new NotFoundException('Registro inexistente');return value;}
 @Delete('api/operations/:capability/:id') async remove(@Param('capability') capability:string,@Param('id') id:string,@Req() req:any){const key=this.capability(capability);const removed=await this.store.remove(key,id,scope(req.user,key));if(!removed)throw new NotFoundException('Registro inexistente');return {deleted:true,id};}
}
`;
  }

  _expressApp(contract, policy) {
    const auth = policy.habilitada;
    return `const express=require('express');
const configureHttpSecurity=require('./security/http-security');
const associations=require('./data/associations');
const Store=require('./record.store');
${auth ? "const mountAuth=require('./auth/auth-express');\nconst {createAuth}=require('./auth/auth-core');\nconst {scopeOf}=require('./auth/ownership');\nconst policy=require('./auth/policy');\n" : ''}const app=express();const store=new Store();const allowed=new Set(${JSON.stringify(contract.operations.map((item) => item.key))});
app.locals.store=store;configureHttpSecurity(app);app.use(express.json({limit:'1mb'}));
${auth ? "const auth=createAuth({store});app.locals.auth=auth;mountAuth(app,auth);\nconst scope=(req,key)=>scopeOf(policy,req.user,key);\n" : 'const scope=()=>null;\n'}app.locals.init=async()=>{await store.init();${auth ? 'await auth.init();' : ''}};
const capability=(req,res,next)=>allowed.has(req.params.capability)?next():res.status(404).json({message:'Operación inexistente'});
app.get('/health',async(_req,res,next)=>{try{await store.ping();res.json({status:'ok',database:'connected'})}catch(e){next(e)}});
app.get('/api/contract',(_req,res)=>res.json(${JSON.stringify(contract)}));
app.get('/api/openapi.json',(_req,res)=>res.json(require('./docs/openapi')));
app.get('/api/docs',(_req,res)=>res.type('html').send(require('./docs/swagger-ui').html()));
app.use('/api/docs/static',(req,res,next)=>{try{express.static(require('./docs/swagger-ui').absoluteAssetPath(),{index:false})(req,res,next);}catch(e){next(e);}});
app.get('/api/associations/:relation',async(req,res,next)=>{try{res.json(await associations(store,'list',req.params.relation,req.query))}catch(e){next(e)}});
app.post('/api/associations/:relation',async(req,res,next)=>{try{res.json(await associations(store,'link',req.params.relation,req.body))}catch(e){next(e)}});
app.delete('/api/associations/:relation',async(req,res,next)=>{try{res.json(await associations(store,'unlink',req.params.relation,req.body))}catch(e){next(e)}});
app.get('/api/operations/:capability',capability,async(req,res,next)=>{
  try{
    const result=await store.list(req.params.capability,req.query,scope(req,req.params.capability));
    if(result&&result.pagination){
      res.set({
        'X-Total-Count':result.pagination.total,
        'X-Page':result.pagination.page,
        'X-Limit':result.pagination.limit,
        'X-Total-Pages':result.pagination.total_pages
      });
    }
    res.json(result);
  }catch(e){next(e)}
});
app.post('/api/operations/:capability',capability,async(req,res,next)=>{try{if(!req.body||Array.isArray(req.body)||typeof req.body!=='object')return res.status(400).json({message:'El cuerpo debe ser un objeto'});res.status(201).json(await store.create(req.params.capability,req.body,scope(req,req.params.capability)))}catch(e){next(e)}});
app.patch('/api/operations/:capability/:id',capability,async(req,res,next)=>{try{const value=await store.update(req.params.capability,req.params.id,req.body,scope(req,req.params.capability));value?res.json(value):res.status(404).json({message:'Registro inexistente'})}catch(e){next(e)}});
app.delete('/api/operations/:capability/:id',capability,async(req,res,next)=>{try{const value=await store.remove(req.params.capability,req.params.id,scope(req,req.params.capability));value?res.json({deleted:true,id:req.params.id}):res.status(404).json({message:'Registro inexistente'})}catch(e){next(e)}});
app.use((error,_req,res,_next)=>{const status=Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:500;res.status(status).json(status>=500?{message:'Error interno del servidor'}:{message:error.message||'Solicitud inválida',...(error.details?{details:error.details}:{})});});module.exports=app;
`;
  }

  _env(database, policy = { habilitada: false }, runtime = 'node') {
    const url = database === 'postgres' ? 'postgresql://app:change-me@localhost:5432/app' : database === 'mysql' ? 'mysql://app:change-me@localhost:3306/app' : 'mongodb://localhost:27017/app';
    const auth = policy.habilitada ? `# Defínelos antes de producción: con ${runtime === 'spring' ? 'APP_ENV' : 'NODE_ENV'}=production se rechaza un JWT_SECRET débil.\nJWT_SECRET=change-me\nADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD=ChangeMe-123\n` : '';
    const http = '# Orígenes permitidos en producción (separados por coma, sin barra final).\nCORS_ORIGINS=http://localhost:8080,http://localhost:5173\nHTTP_RATE_WINDOW_MS=60000\nHTTP_RATE_MAX=300\nAUTH_RATE_MAX=20\n' + (runtime === 'node' ? '# Ajustar solo si hay un proxy de confianza delante.\nTRUST_PROXY_HOPS=\n' : 'APP_ENV=development\n');
    return `PORT=3000\nDATABASE_URL=${url}\nDB_NAME=app\n${http}${auth}`;
  }

  _class(value) { return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(''); }
}

module.exports = GenericBackendGenerator;
