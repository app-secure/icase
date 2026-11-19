const fs=require('node:fs'),path=require('node:path');
const ModuleService=require('../../core/services/ModuleService');
const IDS=['pagos_prueba','sso_oidc','mapas','camara_qr'];
class SpecializedIntegrationsGenerator {
  apply(files,{resolved,policy,contract,modules}) {
    const enabled=new ModuleService().activos(modules).filter(id=>IDS.includes(id));if(!enabled.length)return files;
    if(modules?.pruebas_integracion&&(!modules.pruebas_integracion||typeof modules.pruebas_integracion!=='object'||Array.isArray(modules.pruebas_integracion)||Object.keys(modules.pruebas_integracion).some(key=>!['operation','amountField','latitude','longitude'].includes(key))||Object.values(modules.pruebas_integracion).some(value=>typeof value!=='string'||value.length>100)))throw new Error('El fixture solo admite nombres de operación/campos; no introduzcas credenciales aquí.');
    if(resolved.backend==='spring'||!policy.habilitada)throw new Error('Integraciones especializadas requieren Express/NestJS y JWT aprobado.');
    const read=name=>fs.readFileSync(path.join(__dirname,'../templates/auth',name),'utf8');
    const names=['integration-routes.js','integration-storage.js','integration-preflight.js',...(enabled.includes('pagos_prueba')?['integration-payments.js']:[]),...(enabled.includes('sso_oidc')?['integration-oidc.js']:[])];
    for(const name of names)files.push({ruta:'backend/src/integrations/'+name,lenguaje:'javascript',contenido:read(name)});
    if(enabled.includes('sso_oidc')) {
      const auth=files.find(file=>file.ruta==='backend/src/auth/auth-core.js');auth.contenido=auth.contenido.replace('return { init, login,','return { issue, init, login,');
      const pkg=files.find(file=>file.ruta==='backend/package.json'),data=JSON.parse(pkg.contenido);data.dependencies.jose='6.2.15';pkg.contenido=JSON.stringify(data,null,2);
    }
    const config=`contract:${JSON.stringify(contract)},enabled:${JSON.stringify(enabled)}`;
    files.push({ruta:'backend/tools/integration-preflight.cjs',lenguaje:'javascript',contenido:read('integration-preflight.js')});
    files.push({ruta:'backend/tools/check-integrations.cjs',lenguaje:'javascript',contenido:`try{if(require('node:fs').existsSync('.env'))process.loadEnvFile('.env');}catch{console.error('No se pudo cargar la configuración local');process.exit(1);}\nconst {check}=require('./integration-preflight.cjs');\nconst result=check({enabled:${JSON.stringify(enabled)},operations:${JSON.stringify(contract.operations)}});\nconsole.log(JSON.stringify(result,null,2));\nconsole.log('Comprobación local: no valida credenciales contra proveedores, webhooks, cuentas locales ni permisos de cámara.');\nif(!result.ready)process.exitCode=1;\n`});
    const checkPackage=files.find(file=>file.ruta==='backend/package.json'),checkData=JSON.parse(checkPackage.contenido);
    checkData.scripts={...checkData.scripts,'check:integrations':'node tools/check-integrations.cjs'};
    checkPackage.contenido=JSON.stringify(checkData,null,2);
    if(resolved.backend==='nest') {
      const main=files.find(file=>file.ruta==='backend/src/main.ts');if(!main.contenido.includes("import { RecordStore }"))main.contenido="import { RecordStore } from './record.store';\nimport { AuthService } from './auth.service';\n"+main.contenido;
      main.contenido=main.contenido.replace('app.useGlobalFilters',`require('./integrations/integration-routes')(app.getHttpAdapter().getInstance(),{store:app.get(RecordStore),auth:app.get(AuthService).core,${config}});app.useGlobalFilters`);
    }else{
      const app=files.find(file=>file.ruta==='backend/src/app.js');
      if(enabled.includes('pagos_prueba'))app.contenido=app.contenido.replace("express.json({limit:'1mb'})","express.json({limit:'1mb',verify:(req,res,buffer)=>{if(req.originalUrl.split('?')[0]==='/api/integrations/payments/webhook')req.paymentRawBody=Buffer.from(buffer);}})");
      app.contenido=app.contenido.replace('mountAuth(app,auth);',`require('./integrations/integration-routes')(app,{store,auth,${config}});mountAuth(app,auth);`);
    }
    const env=files.find(file=>file.ruta==='backend/.env.example');env.contenido+='\n# Integraciones opcionales: nunca introducir secretos en prompts o frontend.\nAPP_DATA_DIR=./app-data\n';
    if(enabled.includes('pagos_prueba'))env.contenido+='STRIPE_SECRET_KEY=\nSTRIPE_WEBHOOK_SECRET=\nPAYMENT_NAMESPACE=\nPAYMENT_RETURN_URL=https://your-app.example/\nPAYMENT_BINDINGS={}\n';
    if(enabled.includes('sso_oidc'))env.contenido+='OIDC_ISSUER=\nOIDC_CLIENT_ID=\nOIDC_CLIENT_SECRET=\nOIDC_REDIRECT_URI=https://your-app.example/api/integrations/sso/callback\nOIDC_APP_URL=https://your-app.example/\nOIDC_SUBJECTS={}\n';
    if(enabled.includes('mapas'))env.contenido+='MAP_FIELDS={}\nMAP_TILE_URL=\nMAP_ATTRIBUTION=\n';
    if(!files.some(file=>file.ruta==='backend/.gitignore'))files.push({ruta:'backend/.gitignore',lenguaje:'gitignore',contenido:'node_modules/\napp-data/\n.env\n.env.*\n!.env.example\n'});
    const manifest=files.find(file=>file.ruta==='backend/icase.manifest.json'),data=JSON.parse(manifest.contenido);data.integraciones={enabled,payments:'stripe_test_only',identity:'oidc_preprovisioned',replicas:!enabled.some(id=>['pagos_prueba','sso_oidc'].includes(id)),...(modules?.pruebas_integracion?{fixture:modules.pruebas_integracion}:{})};manifest.contenido=JSON.stringify(data,null,2);
    const api=files.find(file=>file.ruta==='backend/openapi.json'),docs=JSON.parse(api.contenido);
    const param=name=>({name,in:'path',required:true,schema:{type:'string'}}),responses={200:{description:'Resultado de integración'},400:{description:'Datos o firma inválidos'},401:{description:'Sesión/identidad inválida'},403:{description:'Sin permisos'},409:{description:'Solicitud de pago incompatible'},503:{description:'Integración no configurada'}};
    if(enabled.includes('pagos_prueba')){
      docs.paths['/api/integrations/payments/{operation}/{record}']={post:{summary:'Crear o recuperar Checkout de prueba; importe solo desde registro aprobado',parameters:[param('operation'),param('record')],responses}};
      docs.paths['/api/integrations/payments/status/{reference}']={get:{summary:'Estado verificado del pago propio o administrador',parameters:[param('reference')],responses}};
      docs.paths['/api/integrations/payments/webhook']={post:{summary:'Webhook Stripe test firmado sobre bytes originales; no otorga beneficios de negocio automáticamente',security:[],parameters:[{name:'Stripe-Signature',in:'header',required:true,schema:{type:'string'}}],responses}};
    }
    if(enabled.includes('mapas'))docs.paths['/api/integrations/maps/{operation}']={get:{summary:'Configuración pública del mapa para campos numéricos existentes',parameters:[param('operation')],responses}};
    if(enabled.includes('sso_oidc'))for(const [route,method] of [['start','get'],['callback','get'],['session','post']])docs.paths['/api/integrations/sso/'+route]={[method]:{summary:'OIDC '+route+'; state, nonce, PKCE y cookies de un uso',security:[],responses:{...responses,302:{description:'Redirección al proveedor o aplicación'}}}};
    api.contenido=JSON.stringify(docs,null,2);files.find(file=>file.ruta==='backend/src/docs/openapi.js').contenido='module.exports = '+JSON.stringify(docs)+';\n';
    files.push({ruta:'backend/INTEGRATIONS.md',lenguaje:'markdown',contenido:read('integrations.README.md')});
    return files;
  }
}
module.exports=SpecializedIntegrationsGenerator;
