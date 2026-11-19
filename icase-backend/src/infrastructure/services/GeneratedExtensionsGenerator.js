const fs = require('node:fs');
const path = require('node:path');
const ModuleService = require('../../core/services/ModuleService');
const IDS = ['archivos_imagenes','reportes_calculos','recuperacion_cuentas'];
class GeneratedExtensionsGenerator {
  apply(files,{resolved,policy,contract,modules}) {
    const enabled = new ModuleService().activos(modules).filter(id=>IDS.includes(id));
    if (!enabled.length) return files;
    if (resolved.backend==='spring' || !policy.habilitada) throw new Error('Los módulos archivos/reportes/recuperación requieren Express/NestJS y JWT aprobado.');
    for (const name of ['generated-extensions.js',...(enabled.includes('archivos_imagenes')?['generated-files.js']:[]),...(enabled.includes('reportes_calculos')?['generated-reports.js']:[]),...(enabled.includes('recuperacion_cuentas')?['generated-recovery.js']:[])]) files.push({ruta:'backend/src/extensions/'+name,lenguaje:'javascript',contenido:fs.readFileSync(path.join(__dirname,'../templates/auth',name),'utf8')});
    const pkg=files.find(file=>file.ruta==='backend/package.json');const dependencies=JSON.parse(pkg.contenido);
    if(enabled.includes('reportes_calculos')) dependencies.dependencies.pdfkit='0.20.2';
    if(enabled.includes('recuperacion_cuentas')) {
      dependencies.dependencies.nodemailer='10.3.1';
      const auth=files.find(file=>file.ruta==='backend/src/auth/auth-core.js');
      auth.contenido=auth.contenido.replace('jwt.sign({ rol: user.rol }',"jwt.sign({ rol: user.rol, pwd: crypto.createHash('sha256').update(user.password_hash).digest('hex') }")
        .replace('const user = await store.findUserById(claims.sub);',"const user = await store.findUserById(claims.sub);\n    if(user && claims.pwd !== crypto.createHash('sha256').update(user.password_hash).digest('hex')) throw new HttpError(401,'Sesión inválida o expirada.');");
    }
    pkg.contenido=JSON.stringify(dependencies,null,2);
    const env=files.find(file=>file.ruta==='backend/.env.example');
    env.contenido+='\n# Datos privados persistentes; no publicar este directorio.\nAPP_DATA_DIR=./app-data\n';
    if(enabled.includes('recuperacion_cuentas'))env.contenido+='SMTP_HOST=\nSMTP_PORT=587\nSMTP_FROM=\nSMTP_USER=\nSMTP_PASSWORD=\nSMTP_SECURE=false\nSMTP_ALLOW_INSECURE=false\nRESET_PUBLIC_URL=https://your-app.example/\n';
    files.push({ruta:'backend/.gitignore',lenguaje:'gitignore',contenido:'node_modules/\ndist/\napp-data/\n.env\n.env.*\n!.env.example\n'});
    const config = `store,auth,contract:${JSON.stringify(contract)},enabled:${JSON.stringify(enabled)}`;
    if (resolved.backend==='nest') {
      const main = files.find(file=>file.ruta==='backend/src/main.ts');
      if (!main.contenido.includes("import { RecordStore }")) main.contenido="import { RecordStore } from './record.store';\nimport { AuthService } from './auth.service';\n"+main.contenido;
      main.contenido=main.contenido.replace('app.useGlobalFilters', `require('./extensions/generated-extensions')(app.getHttpAdapter().getInstance(),{${config.replace('store,auth,','store:app.get(RecordStore),auth:app.get(AuthService).core,')}});app.useGlobalFilters`);
    } else {
      const app = files.find(file=>file.ruta==='backend/src/app.js');
      app.contenido=app.contenido.replace('mountAuth(app,auth);',`require('./extensions/generated-extensions')(app,{${config}});mountAuth(app,auth);`);
    }
    const manifest=files.find(file=>file.ruta==='backend/icase.manifest.json');
    const data=JSON.parse(manifest.contenido); data.extensions={enabled,storage:'local_private_single_process',max_file_bytes:524288}; manifest.contenido=JSON.stringify(data,null,2);
    const api=files.find(file=>file.ruta==='backend/openapi.json');const docs=JSON.parse(api.contenido);
    const parameter=name=>({name,in:'path',required:true,schema:{type:'string'}});
    const responses={'200':{description:'Operación completada'},'400':{description:'Datos inválidos'},'401':{description:'Sesión requerida'},'403':{description:'Permiso insuficiente'},'404':{description:'Registro/archivo inexistente'},'413':{description:'Límite de tamaño/cuota excedido'},'429':{description:'Demasiadas solicitudes'},'500':{description:'Error interno sanitizado'}};
    if(enabled.includes('archivos_imagenes')) {
      docs.paths['/api/files/{operation}/{record}']={parameters:[parameter('operation'),parameter('record')],get:{summary:'Listar adjuntos privados del registro',responses},post:{summary:'Adjuntar PNG/JPEG/PDF, máximo 512 KiB; requiere PATCH sobre operación',parameters:[{name:'X-File-Name',in:'header',schema:{type:'string'}}],requestBody:{required:true,content:Object.fromEntries(['image/png','image/jpeg','application/pdf'].map(type=>[type,{schema:{type:'string',format:'binary'}}]))},responses:{...responses,'201':{description:'Adjunto creado'}}}};
      docs.paths['/api/download/{id}']={parameters:[parameter('id')],get:{summary:'Descarga autenticada; no hay URL pública',responses},delete:{summary:'Eliminar adjunto; requiere PATCH',responses}};
    }
    if(enabled.includes('reportes_calculos'))docs.paths['/api/reports/{operation}']={parameters:[parameter('operation')],get:{summary:'Agregados y exportación autorizada. Límite 10000 registros / 2 MiB; no es cierre contable',parameters:[{name:'format',in:'query',schema:{type:'string',enum:['json','csv','pdf'],default:'json'}}],responses}};
    if(enabled.includes('recuperacion_cuentas'))for(const action of ['forgot-password','reset-password'])docs.paths['/api/auth/'+action]={post:{summary:action==='forgot-password'?'Solicitar enlace SMTP (respuesta genérica)':'Restablecer con token caducable de un uso',security:[],requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:action==='forgot-password'?['email']:['token','password'],properties:action==='forgot-password'?{email:{type:'string',format:'email'}}:{token:{type:'string',pattern:'^[a-f0-9]{64}$'},password:{type:'string',minLength:8,maxLength:128}}}}}},responses:{...responses,'202':{description:'Solicitud recibida, sin revelar si existe la cuenta'},'503':{description:'SMTP/URL pública no configurados'}}}};
    api.contenido=JSON.stringify(docs,null,2);files.find(file=>file.ruta==='backend/src/docs/openapi.js').contenido='module.exports = '+JSON.stringify(docs)+';\n';
    return files;
  }
}
module.exports=GeneratedExtensionsGenerator;
