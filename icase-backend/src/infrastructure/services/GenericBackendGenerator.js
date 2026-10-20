const ApplicationContractBuilder = require('./ApplicationContractBuilder');
const fs = require('node:fs');
const path = require('node:path');
const BackendDataLayerGenerator = require('./BackendDataLayerGenerator');
const AccessControlService = require('../../core/services/AccessControlService');
const OpenApiGenerator = require('./OpenApiGenerator');

const AUTH_TEMPLATES = path.join(__dirname, '..', 'templates', 'auth');

const slug = (value) => String(value || 'project').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

class GenericBackendGenerator {
  generate({ proyecto, requirements, stack, domainModel = null, rules = [], access = null }) {
    const contract = new ApplicationContractBuilder().build({ proyecto, requerimientos: requirements, domainModel, rules });
    const policy = new AccessControlService().politica(access, contract.operations);
    contract.auth = policy;
    const database = this._database(stack.base_datos);
    const data = new BackendDataLayerGenerator().build({ contract, database, policy });
    const openapi = new OpenApiGenerator().build({ proyecto, contract, model: data.model, policy });
    data.files.shared.push(
      { ruta: 'backend/openapi.json', lenguaje: 'json', contenido: `${JSON.stringify(openapi, null, 2)}\n` },
      { ruta: 'backend/src/docs/openapi.js', lenguaje: 'javascript', contenido: `module.exports = ${JSON.stringify(openapi)};\n` }
    );
    return /nestjs/i.test(stack.backend || '')
      ? this._nest(proyecto, contract, database, data, policy)
      : this._express(proyecto, contract, database, data, policy);
  }

  _authFiles(policy, adapter) {
    if (!policy.habilitada) return [];
    const read = (name) => fs.readFileSync(path.join(AUTH_TEMPLATES, name), 'utf8');
    return [
      { ruta: 'backend/src/auth/policy.js', lenguaje: 'javascript', contenido: `module.exports = ${JSON.stringify(policy, null, 2)};\n` },
      { ruta: 'backend/src/auth/auth-core.js', lenguaje: 'javascript', contenido: read('auth-core.js') },
      ...(adapter === 'express' ? [{ ruta: 'backend/src/auth/auth-express.js', lenguaje: 'javascript', contenido: read('auth-express.js') }] : [])
    ];
  }

  _database(value) {
    if (/postgres/i.test(value || '')) return 'postgres';
    if (/mysql/i.test(value || '')) return 'mysql';
    return 'mongodb';
  }

  _manifest(project, contract, database, data) {
    const tables = Object.entries(data.model.tables).map(([name, table]) => ({ name, entity: table.entity, columns: table.columns.map((column) => column.column), references: table.references }));
    return JSON.stringify({
      ...contract,
      database,
      mode: contract.entities.length ? 'entity_crud_v1' : 'generic_crud_v1',
      docs: { openapi: '/api/openapi.json', archivo: 'backend/openapi.json' },
      storage: { layout: 'table_per_entity', operations: data.model.operations, tables, migrations: data.migrations.map((item) => item.id) },
      requisitos: contract.operations.map((item) => ({ id: item.id, nombre: item.name })),
      endpoints: contract.operations.flatMap((item) => [item.collectionPath, item.itemPath])
    }, null, 2);
  }

  _dependencies(database, nest = false, auth = false) {
    return {
      ...(auth ? { jsonwebtoken: '^9.0.3' } : {}),
      ...(nest ? { '@nestjs/common': '^10.0.0', '@nestjs/core': '^10.0.0', '@nestjs/platform-express': '^10.0.0', 'reflect-metadata': '^0.2.0', rxjs: '^7.8.0' } : { cors: '^2.8.5', dotenv: '^16.4.7', express: '^4.21.2' }),
      ...(database === 'postgres' ? { pg: '^8.13.0' } : database === 'mysql' ? { mysql2: '^3.11.0' } : { mongodb: '^6.12.0' })
    };
  }

  _nest(project, contract, database, data, policy) {
    const packageJson = { name: `${slug(project.nombre)}-backend`, version: '1.0.0', private: true, scripts: { build: 'tsc', start: 'node dist/main.js', dev: 'ts-node src/main.ts', test: 'node --test' }, dependencies: this._dependencies(database, true, policy.habilitada), devDependencies: { '@types/node': '^22.0.0', '@types/pg': '^8.11.0', 'ts-node': '^10.9.0', typescript: '^5.0.0' } };
    return [
      { ruta: 'backend/package.json', lenguaje: 'json', contenido: JSON.stringify(packageJson, null, 2) },
      { ruta: 'backend/tsconfig.json', lenguaje: 'json', contenido: JSON.stringify({ compilerOptions: { module: 'commonjs', target: 'ES2022', experimentalDecorators: true, emitDecoratorMetadata: true, strict: true, esModuleInterop: true, allowJs: true, outDir: './dist' }, include: ['src/**/*.ts', 'src/**/*.js'] }, null, 2) },
      { ruta: 'backend/.env.example', lenguaje: 'dotenv', contenido: this._env(database, policy) },
      { ruta: 'backend/icase.manifest.json', lenguaje: 'json', contenido: this._manifest(project, contract, database, data) },
      { ruta: 'backend/src/main.ts', lenguaje: 'typescript', contenido: "import 'reflect-metadata';\nimport { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\nimport { StoreExceptionFilter } from './store-exception.filter';\nasync function bootstrap(){const app=await NestFactory.create(AppModule);app.enableCors();app.useGlobalFilters(new StoreExceptionFilter());await app.listen(Number(process.env.PORT||3000));}\nbootstrap();\n" },
      { ruta: 'backend/src/store-exception.filter.ts', lenguaje: 'typescript', contenido: this._nestFilter() },
      { ruta: 'backend/src/app.module.ts', lenguaje: 'typescript', contenido: this._nestModule(policy) },
      { ruta: 'backend/src/app.controller.ts', lenguaje: 'typescript', contenido: this._nestController(contract) },
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

  _express(project, contract, database, data, policy) {
    const packageJson = { name: `${slug(project.nombre)}-backend`, version: '1.0.0', private: true, scripts: { start: 'node src/main.js', dev: 'node --watch src/main.js', test: 'node --test' }, dependencies: this._dependencies(database, false, policy.habilitada) };
    return [
      { ruta: 'backend/package.json', lenguaje: 'json', contenido: JSON.stringify(packageJson, null, 2) },
      { ruta: 'backend/.env.example', lenguaje: 'dotenv', contenido: this._env(database, policy) },
      { ruta: 'backend/icase.manifest.json', lenguaje: 'json', contenido: this._manifest(project, contract, database, data) },
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
    if (error instanceof HttpException) return response.status(error.getStatus()).json(error.getResponse());
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return response.status(status).json({ message: error?.message || 'Error interno', ...(error?.details ? { details: error.details } : {}) });
  }
}
`;
  }

  _nestController(contract) {
    return `import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { RecordStore } from './record.store';
const allowed=new Set(${JSON.stringify(contract.operations.map((item) => item.key))});
@Controller() export class AppController {
 constructor(private readonly store:RecordStore){}
 private capability(value:string){if(!allowed.has(value))throw new NotFoundException('Operación inexistente');return value;}
 @Get('health') async health(){await this.store.ping();return {status:'ok',database:'connected'};}
 @Get('api/contract') contract(){return ${JSON.stringify(contract)};}
 @Get('api/openapi.json') openapi(){return require('./docs/openapi.js');}
 @Get('api/operations/:capability') list(@Param('capability') capability:string){return this.store.list(this.capability(capability));}
 @Post('api/operations/:capability') create(@Param('capability') capability:string,@Body() body:any){if(!body||Array.isArray(body)||typeof body!=='object')throw new BadRequestException('El cuerpo debe ser un objeto');return this.store.create(this.capability(capability),body);}
 @Patch('api/operations/:capability/:id') async update(@Param('capability') capability:string,@Param('id') id:string,@Body() body:any){const value=await this.store.update(this.capability(capability),id,body);if(!value)throw new NotFoundException('Registro inexistente');return value;}
 @Delete('api/operations/:capability/:id') async remove(@Param('capability') capability:string,@Param('id') id:string){const removed=await this.store.remove(this.capability(capability),id);if(!removed)throw new NotFoundException('Registro inexistente');return {deleted:true,id};}
}
`;
  }

  _expressApp(contract, policy) {
    const auth = policy.habilitada;
    return `const express=require('express');
const cors=require('cors');
const Store=require('./record.store');
${auth ? "const mountAuth=require('./auth/auth-express');\nconst {createAuth}=require('./auth/auth-core');\n" : ''}const app=express();const store=new Store();const allowed=new Set(${JSON.stringify(contract.operations.map((item) => item.key))});
app.locals.store=store;app.use(cors());app.use(express.json({limit:'1mb'}));
${auth ? "const auth=createAuth({store});app.locals.auth=auth;mountAuth(app,auth);\n" : ''}app.locals.init=async()=>{await store.init();${auth ? 'await auth.init();' : ''}};
const capability=(req,res,next)=>allowed.has(req.params.capability)?next():res.status(404).json({message:'Operación inexistente'});
app.get('/health',async(_req,res,next)=>{try{await store.ping();res.json({status:'ok',database:'connected'})}catch(e){next(e)}});
app.get('/api/contract',(_req,res)=>res.json(${JSON.stringify(contract)}));
app.get('/api/openapi.json',(_req,res)=>res.json(require('./docs/openapi')));
app.get('/api/operations/:capability',capability,async(req,res,next)=>{try{res.json(await store.list(req.params.capability))}catch(e){next(e)}});
app.post('/api/operations/:capability',capability,async(req,res,next)=>{try{if(!req.body||Array.isArray(req.body)||typeof req.body!=='object')return res.status(400).json({message:'El cuerpo debe ser un objeto'});res.status(201).json(await store.create(req.params.capability,req.body))}catch(e){next(e)}});
app.patch('/api/operations/:capability/:id',capability,async(req,res,next)=>{try{const value=await store.update(req.params.capability,req.params.id,req.body);value?res.json(value):res.status(404).json({message:'Registro inexistente'})}catch(e){next(e)}});
app.delete('/api/operations/:capability/:id',capability,async(req,res,next)=>{try{const value=await store.remove(req.params.capability,req.params.id);value?res.json({deleted:true,id:req.params.id}):res.status(404).json({message:'Registro inexistente'})}catch(e){next(e)}});
app.use((error,_req,res,_next)=>res.status(Number.isInteger(error.status)?error.status:500).json({message:error.message||'Error interno',...(error.details?{details:error.details}:{})}));module.exports=app;
`;
  }

  _env(database, policy = { habilitada: false }) {
    const url = database === 'postgres' ? 'postgresql://app:change-me@localhost:5432/app' : database === 'mysql' ? 'mysql://app:change-me@localhost:3306/app' : 'mongodb://localhost:27017/app';
    const auth = policy.habilitada ? '# Defínelos antes de producción: con NODE_ENV=production se rechaza un JWT_SECRET débil.\nJWT_SECRET=change-me\nADMIN_EMAIL=admin@example.com\nADMIN_PASSWORD=ChangeMe-123\n' : '';
    return `PORT=3000\nDATABASE_URL=${url}\nDB_NAME=app\n${auth}`;
  }

  _class(value) { return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(''); }
}

module.exports = GenericBackendGenerator;
