const ApplicationContractBuilder = require('./ApplicationContractBuilder');

const slug = (value) => String(value || 'project').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

class GenericBackendGenerator {
  generate({ proyecto, requirements, stack }) {
    const contract = new ApplicationContractBuilder().build({ proyecto, requerimientos: requirements });
    const database = this._database(stack.base_datos);
    return /nestjs/i.test(stack.backend || '')
      ? this._nest(proyecto, contract, database)
      : this._express(proyecto, contract, database);
  }

  _database(value) {
    if (/postgres/i.test(value || '')) return 'postgres';
    if (/mysql/i.test(value || '')) return 'mysql';
    return 'mongodb';
  }

  _manifest(project, contract, database) {
    return JSON.stringify({ ...contract, database, mode: 'generic_crud_v1', requisitos: contract.operations.map((item) => ({ id: item.id, nombre: item.name })), endpoints: contract.operations.flatMap((item) => [item.collectionPath, item.itemPath]) }, null, 2);
  }

  _dependencies(database, nest = false) {
    return {
      ...(nest ? { '@nestjs/common': '^10.0.0', '@nestjs/core': '^10.0.0', '@nestjs/platform-express': '^10.0.0', 'reflect-metadata': '^0.2.0', rxjs: '^7.8.0' } : { cors: '^2.8.5', dotenv: '^16.4.7', express: '^4.21.2' }),
      ...(database === 'postgres' ? { pg: '^8.13.0' } : database === 'mysql' ? { mysql2: '^3.11.0' } : { mongodb: '^6.12.0' })
    };
  }

  _nest(project, contract, database) {
    const packageJson = { name: `${slug(project.nombre)}-backend`, version: '1.0.0', private: true, scripts: { build: 'tsc', start: 'node dist/main.js', dev: 'ts-node src/main.ts', test: 'node --test' }, dependencies: this._dependencies(database, true), devDependencies: { '@types/node': '^22.0.0', '@types/pg': '^8.11.0', 'ts-node': '^10.9.0', typescript: '^5.0.0' } };
    return [
      { ruta: 'backend/package.json', lenguaje: 'json', contenido: JSON.stringify(packageJson, null, 2) },
      { ruta: 'backend/tsconfig.json', lenguaje: 'json', contenido: JSON.stringify({ compilerOptions: { module: 'commonjs', target: 'ES2022', experimentalDecorators: true, emitDecoratorMetadata: true, strict: true, esModuleInterop: true, outDir: './dist' }, include: ['src/**/*.ts'] }, null, 2) },
      { ruta: 'backend/.env.example', lenguaje: 'dotenv', contenido: this._env(database) },
      { ruta: 'backend/icase.manifest.json', lenguaje: 'json', contenido: this._manifest(project, contract, database) },
      { ruta: 'backend/src/main.ts', lenguaje: 'typescript', contenido: "import 'reflect-metadata';\nimport { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\nasync function bootstrap(){const app=await NestFactory.create(AppModule);app.enableCors();await app.listen(Number(process.env.PORT||3000));}\nbootstrap();\n" },
      { ruta: 'backend/src/app.module.ts', lenguaje: 'typescript', contenido: "import { Module } from '@nestjs/common';\nimport { AppController } from './app.controller';\nimport { RecordStore } from './record.store';\n@Module({controllers:[AppController],providers:[RecordStore]}) export class AppModule {}\n" },
      { ruta: 'backend/src/app.controller.ts', lenguaje: 'typescript', contenido: this._nestController(contract) },
      { ruta: 'backend/src/record.store.ts', lenguaje: 'typescript', contenido: this._store(database, true) },
      ...contract.operations.map((item) => ({ ruta: `backend/src/modules/${item.key}/${item.key}.module.ts`, lenguaje: 'typescript', contenido: `// ${item.id}: ${item.name}\nexport const ${this._class(item.key)}Capability = ${JSON.stringify(item.key)};\n` }))
    ];
  }

  _express(project, contract, database) {
    const packageJson = { name: `${slug(project.nombre)}-backend`, version: '1.0.0', private: true, scripts: { start: 'node src/main.js', dev: 'node --watch src/main.js', test: 'node --test' }, dependencies: this._dependencies(database) };
    return [
      { ruta: 'backend/package.json', lenguaje: 'json', contenido: JSON.stringify(packageJson, null, 2) },
      { ruta: 'backend/.env.example', lenguaje: 'dotenv', contenido: this._env(database) },
      { ruta: 'backend/icase.manifest.json', lenguaje: 'json', contenido: this._manifest(project, contract, database) },
      { ruta: 'backend/src/main.js', lenguaje: 'javascript', contenido: "require('dotenv').config();\nconst app=require('./app');\nconst port=Number(process.env.PORT||3000);\napp.locals.store.init().then(()=>app.listen(port,()=>console.log('API listening on '+port))).catch((error)=>{console.error(error);process.exit(1)});\n" },
      { ruta: 'backend/src/app.js', lenguaje: 'javascript', contenido: this._expressApp(contract) },
      { ruta: 'backend/src/record.store.js', lenguaje: 'javascript', contenido: this._store(database, false) },
      ...contract.operations.map((item) => ({ ruta: `backend/src/modules/${item.key}/${item.key}.js`, lenguaje: 'javascript', contenido: `module.exports=${JSON.stringify(item, null, 2)};\n` }))
    ];
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
 @Get('api/operations/:capability') list(@Param('capability') capability:string){return this.store.list(this.capability(capability));}
 @Post('api/operations/:capability') create(@Param('capability') capability:string,@Body() body:any){if(!body||Array.isArray(body)||typeof body!=='object')throw new BadRequestException('El cuerpo debe ser un objeto');return this.store.create(this.capability(capability),body);}
 @Patch('api/operations/:capability/:id') async update(@Param('capability') capability:string,@Param('id') id:string,@Body() body:any){const value=await this.store.update(this.capability(capability),id,body);if(!value)throw new NotFoundException('Registro inexistente');return value;}
 @Delete('api/operations/:capability/:id') async remove(@Param('capability') capability:string,@Param('id') id:string){const removed=await this.store.remove(this.capability(capability),id);if(!removed)throw new NotFoundException('Registro inexistente');return {deleted:true,id};}
}
`;
  }

  _expressApp(contract) {
    return `const express=require('express');
const cors=require('cors');
const Store=require('./record.store');
const app=express();const store=new Store();const allowed=new Set(${JSON.stringify(contract.operations.map((item) => item.key))});
app.locals.store=store;app.use(cors());app.use(express.json({limit:'1mb'}));
const capability=(req,res,next)=>allowed.has(req.params.capability)?next():res.status(404).json({message:'Operación inexistente'});
app.get('/health',async(_req,res,next)=>{try{await store.ping();res.json({status:'ok',database:'connected'})}catch(e){next(e)}});
app.get('/api/contract',(_req,res)=>res.json(${JSON.stringify(contract)}));
app.get('/api/operations/:capability',capability,async(req,res,next)=>{try{res.json(await store.list(req.params.capability))}catch(e){next(e)}});
app.post('/api/operations/:capability',capability,async(req,res,next)=>{try{if(!req.body||Array.isArray(req.body)||typeof req.body!=='object')return res.status(400).json({message:'El cuerpo debe ser un objeto'});res.status(201).json(await store.create(req.params.capability,req.body))}catch(e){next(e)}});
app.patch('/api/operations/:capability/:id',capability,async(req,res,next)=>{try{const value=await store.update(req.params.capability,req.params.id,req.body);value?res.json(value):res.status(404).json({message:'Registro inexistente'})}catch(e){next(e)}});
app.delete('/api/operations/:capability/:id',capability,async(req,res,next)=>{try{const value=await store.remove(req.params.capability,req.params.id);value?res.json({deleted:true,id:req.params.id}):res.status(404).json({message:'Registro inexistente'})}catch(e){next(e)}});
app.use((error,_req,res,_next)=>res.status(500).json({message:error.message||'Error interno'}));module.exports=app;
`;
  }

  _store(database, typescript) {
    if (!typescript) {
      if (database === 'postgres') return `const {Pool}=require('pg');
class RecordStore{constructor(){this.pool=new Pool({connectionString:process.env.DATABASE_URL})}async init(){await this.pool.query('CREATE TABLE IF NOT EXISTS icase_records(id BIGSERIAL PRIMARY KEY,capability TEXT NOT NULL,data JSONB NOT NULL,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())')}async ping(){await this.pool.query('SELECT 1')}async list(c){return (await this.pool.query('SELECT id,capability,data,created_at,updated_at FROM icase_records WHERE capability=$1 ORDER BY id',[c])).rows}async create(c,d){return (await this.pool.query('INSERT INTO icase_records(capability,data) VALUES($1,$2) RETURNING *',[c,d])).rows[0]}async update(c,id,d){return (await this.pool.query('UPDATE icase_records SET data=data||$1::jsonb,updated_at=now() WHERE capability=$2 AND id=$3 RETURNING *',[JSON.stringify(d),c,id])).rows[0]||null}async remove(c,id){return (await this.pool.query('DELETE FROM icase_records WHERE capability=$1 AND id=$2 RETURNING id',[c,id])).rowCount>0}}
module.exports=RecordStore;`;
      if (database === 'mysql') return `const mysql=require('mysql2/promise');
class RecordStore{constructor(){this.pool=mysql.createPool(process.env.DATABASE_URL||'')}async init(){await this.pool.query('CREATE TABLE IF NOT EXISTS icase_records(id BIGINT AUTO_INCREMENT PRIMARY KEY,capability VARCHAR(191) NOT NULL,data JSON NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)')}async ping(){await this.pool.query('SELECT 1')}async list(c){const [r]=await this.pool.query('SELECT * FROM icase_records WHERE capability=? ORDER BY id',[c]);return r}async create(c,d){const [r]=await this.pool.query('INSERT INTO icase_records(capability,data) VALUES(?,?)',[c,JSON.stringify(d)]);return {id:r.insertId,capability:c,data:d}}async update(c,id,d){const current=(await this.list(c)).find((x)=>String(x.id)===String(id));if(!current)return null;const data={...(typeof current.data==='string'?JSON.parse(current.data):current.data),...d};await this.pool.query('UPDATE icase_records SET data=? WHERE capability=? AND id=?',[JSON.stringify(data),c,id]);return {id:Number(id),capability:c,data}}async remove(c,id){const [r]=await this.pool.query('DELETE FROM icase_records WHERE capability=? AND id=?',[c,id]);return r.affectedRows>0}}
module.exports=RecordStore;`;
      return `const {MongoClient,ObjectId}=require('mongodb');
class RecordStore{constructor(){this.client=new MongoClient(process.env.DATABASE_URL||'mongodb://database:27017');this.collection=this.client.db(process.env.DB_NAME||'app').collection('icase_records')}async init(){await this.client.connect();await this.collection.createIndex({capability:1})}async ping(){await this.client.db().command({ping:1})}async list(c){return this.collection.find({capability:c}).sort({createdAt:1}).toArray()}async create(c,d){const value={capability:c,data:d,createdAt:new Date(),updatedAt:new Date()};const result=await this.collection.insertOne(value);return {...value,id:String(result.insertedId)}}async update(c,id,d){if(!ObjectId.isValid(id))return null;const current=await this.collection.findOne({_id:new ObjectId(id),capability:c});if(!current)return null;const data={...(current.data||{}),...d};await this.collection.updateOne({_id:current._id},{$set:{data,updatedAt:new Date()}});return {...current,id:String(current._id),data}}async remove(c,id){if(!ObjectId.isValid(id))return false;return (await this.collection.deleteOne({_id:new ObjectId(id),capability:c})).deletedCount>0}}
module.exports=RecordStore;`;
    }
    const exp = typescript ? 'export class RecordStore' : 'class RecordStore';
    const end = typescript ? '' : '\nmodule.exports=RecordStore;';
    if (database === 'postgres') return `import { Injectable, OnModuleInit } from '@nestjs/common';\nimport { Pool } from 'pg';\n@Injectable()\n${exp} implements OnModuleInit{private pool=new Pool({connectionString:process.env.DATABASE_URL});async onModuleInit(){await this.init()}async init(){await this.pool.query('CREATE TABLE IF NOT EXISTS icase_records(id BIGSERIAL PRIMARY KEY,capability TEXT NOT NULL,data JSONB NOT NULL,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now())')}async ping(){await this.pool.query('SELECT 1')}async list(c:string){return (await this.pool.query('SELECT id,capability,data,created_at,updated_at FROM icase_records WHERE capability=$1 ORDER BY id',[c])).rows}async create(c:string,d:any){return (await this.pool.query('INSERT INTO icase_records(capability,data) VALUES($1,$2) RETURNING *',[c,d])).rows[0]}async update(c:string,id:string,d:any){return (await this.pool.query('UPDATE icase_records SET data=data||$1::jsonb,updated_at=now() WHERE capability=$2 AND id=$3 RETURNING *',[JSON.stringify(d),c,id])).rows[0]||null}async remove(c:string,id:string){return ((await this.pool.query('DELETE FROM icase_records WHERE capability=$1 AND id=$2 RETURNING id',[c,id])).rowCount||0)>0}}${end}`;
    if (database === 'mysql') return `import { Injectable, OnModuleInit } from '@nestjs/common';\nimport mysql from 'mysql2/promise';\n@Injectable()\n${exp} implements OnModuleInit{private pool=mysql.createPool(process.env.DATABASE_URL||'');async onModuleInit(){await this.init()}async init(){await this.pool.query('CREATE TABLE IF NOT EXISTS icase_records(id BIGINT AUTO_INCREMENT PRIMARY KEY,capability VARCHAR(191) NOT NULL,data JSON NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)')}async ping(){await this.pool.query('SELECT 1')}async list(c:string){const [r]:any=await this.pool.query('SELECT * FROM icase_records WHERE capability=? ORDER BY id',[c]);return r}async create(c:string,d:any){const [r]:any=await this.pool.query('INSERT INTO icase_records(capability,data) VALUES(?,?)',[c,JSON.stringify(d)]);return {id:r.insertId,capability:c,data:d}}async update(c:string,id:string,d:any){const current=(await this.list(c)).find((x:any)=>String(x.id)===String(id));if(!current)return null;const data={...(typeof current.data==='string'?JSON.parse(current.data):current.data),...d};await this.pool.query('UPDATE icase_records SET data=? WHERE capability=? AND id=?',[JSON.stringify(data),c,id]);return {id:Number(id),capability:c,data}}async remove(c:string,id:string){const [r]:any=await this.pool.query('DELETE FROM icase_records WHERE capability=? AND id=?',[c,id]);return r.affectedRows>0}}${end}`;
    return `import { Injectable, OnModuleInit } from '@nestjs/common';\nimport { MongoClient, ObjectId } from 'mongodb';\n@Injectable()\n${exp} implements OnModuleInit{private client=new MongoClient(process.env.DATABASE_URL||'mongodb://database:27017');private collection=this.client.db(process.env.DB_NAME||'app').collection('icase_records');async onModuleInit(){await this.init()}async init(){await this.client.connect();await this.collection.createIndex({capability:1})}async ping(){await this.client.db().command({ping:1})}async list(c:string){return this.collection.find({capability:c}).sort({createdAt:1}).toArray()}async create(c:string,d:any){const value={capability:c,data:d,createdAt:new Date(),updatedAt:new Date()};const result=await this.collection.insertOne(value);return {...value,id:String(result.insertedId)}}async update(c:string,id:string,d:any){if(!ObjectId.isValid(id))return null;const current=await this.collection.findOne({_id:new ObjectId(id),capability:c});if(!current)return null;const data={...(current.data||{}),...d};await this.collection.updateOne({_id:current._id},{$set:{data,updatedAt:new Date()}});return {...current,id:String(current._id),data}}async remove(c:string,id:string){if(!ObjectId.isValid(id))return false;return (await this.collection.deleteOne({_id:new ObjectId(id),capability:c})).deletedCount>0}}${end}`;
  }

  _env(database) {
    const url = database === 'postgres' ? 'postgresql://app:change-me@localhost:5432/app' : database === 'mysql' ? 'mysql://app:change-me@localhost:3306/app' : 'mongodb://localhost:27017/app';
    return `PORT=3000\nDATABASE_URL=${url}\nDB_NAME=app\n`;
  }

  _class(value) { return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(''); }
}

module.exports = GenericBackendGenerator;
