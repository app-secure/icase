const fs = require('node:fs');
const path = require('node:path');
const ModuleService = require('../../core/services/ModuleService');

class ChangeEventsGenerator {
  enabled(modules) { return new ModuleService().activos(modules).includes('eventos_cambios'); }

  apply(files, { resolved, policy, contract,modules }) {
    if (resolved.language === 'java' || !policy.habilitada) throw new Error('Eventos de cambios experimental requiere Express/NestJS y autenticación JWT aprobada.');
    const pkg = files.find(file => file.ruta === 'backend/package.json');
    const content = JSON.parse(pkg.contenido);
    content.dependencies['socket.io'] = '4.8.4';
    content.dependencies.redis='6.3.1';
    pkg.contenido = JSON.stringify(content, null, 2);
    files.push({ ruta: 'backend/src/events/change-events.js', lenguaje: 'javascript', contenido: fs.readFileSync(path.resolve(__dirname, '../templates/auth/change-events.js'), 'utf8') });
    files.push({ruta:'backend/src/events/change-events-redis.js',lenguaje:'javascript',contenido:fs.readFileSync(path.resolve(__dirname,'../templates/auth/change-events-redis.js'),'utf8')});
    const replicas=new ModuleService().activos(modules).includes('eventos_replicas');
    const config = `requireRedis:${replicas},operations:${JSON.stringify(contract.operations)},associations:${JSON.stringify(contract.associations||[])},origins:String(process.env.CORS_ORIGINS||'http://localhost:5173,http://localhost:8080').split(',').map((v:string)=>v.trim()).filter(Boolean)`;
    if (resolved.backend === 'nest') {
      const main = files.find(file => file.ruta === 'backend/src/main.ts');
      main.contenido = `import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { StoreExceptionFilter } from './store-exception.filter';
import { RecordStore } from './record.store';
import { AuthService } from './auth.service';
const configureHttpSecurity = require('./security/http-security');
const { connectChangeEvents: attachChangeEvents } = require('./events/change-events');
async function bootstrap(){const app=await NestFactory.create(AppModule);configureHttpSecurity(app.getHttpAdapter().getInstance());app.useGlobalFilters(new StoreExceptionFilter());await app.init();await attachChangeEvents(app.getHttpServer(),{store:app.get(RecordStore),auth:app.get(AuthService).core,${config}});await app.listen(Number(process.env.PORT||3000));}
bootstrap();\n`;
    } else {
      files.find(file => file.ruta === 'backend/src/main.js').contenido = `require('dotenv').config();
const app=require('./app');const {createServer}=require('node:http');
const {connectChangeEvents:attachChangeEvents}=require('./events/change-events');
app.locals.init().then(async()=>{const server=createServer(app);await attachChangeEvents(server,{store:app.locals.store,auth:app.locals.auth,${config.replace('(v:string)', '(v)')}});server.listen(Number(process.env.PORT||3000));}).catch(error=>{console.error(error);process.exit(1)});\n`;
    }
    const manifest = files.find(file => file.ruta === 'backend/icase.manifest.json');
    const data = JSON.parse(manifest.contenido);
    data.eventos_cambios = { experimental: true, transport: 'socket.io', path: '/socket.io', subscribe: 'subscribe', event: 'records:changed', payload: ['operation', 'method'], scope: 'invalidación CRUD en un proceso; clientes React/Expo con reconsulta HTTP; sin datos de registros, replay, chat ni alta disponibilidad' };
    manifest.contenido = JSON.stringify(data, null, 2);
    const updated=JSON.parse(manifest.contenido);updated.eventos_cambios.replicas=replicas;updated.eventos_cambios.associations=true;updated.eventos_cambios.coordination='optional_redis_pubsub_reauthorized';updated.eventos_cambios.scope='invalidaciones CRUD y N:M; coordinación Redis opcional; sin replay ni SLA';manifest.contenido=JSON.stringify(updated,null,2);
    files.find(file=>file.ruta==='backend/.env.example').contenido+='\n# Opcional: coordinación entre procesos. Namespace distinto por aplicación/entorno.\nEVENTS_REDIS_URL=\nEVENTS_NAMESPACE=\n';
    files.push({ruta:'backend/CHANGE-EVENTS.md',lenguaje:'markdown',contenido:fs.readFileSync(path.resolve(__dirname,'../templates/auth/change-events.README.md'),'utf8')});
    return files;
  }
}
module.exports = ChangeEventsGenerator;
