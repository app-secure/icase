const express=require('express'),path=require('node:path'),crypto=require('node:crypto');
const {HttpError}=require('../data/store-support');
module.exports=function integrations(app,{store,auth,contract,enabled}) {
  const router=express.Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res,next);}catch(error){next(error);}};
  const operations=new Map(contract.operations.map(operation=>[operation.key,operation]));
  const authorize=async(req,key,method='GET')=>{if(!operations.has(key))throw new HttpError(404,'Operación inexistente');const user=await auth.authenticate(req.headers.authorization);auth.authorize(user,method,'/api/operations/'+key);return user;};
  const {storage}=require('./integration-storage');
  if(enabled.includes('pagos_prueba')) {
    const service=require('./integration-payments').payments({store,operations:contract.operations,ledger:storage(path.join(process.env.APP_DATA_DIR||'./app-data','payments'))});
    router.post('/payments/webhook',express.raw({type:'application/json',limit:'64kb'}),wrap(async(req,res)=>res.json(await service.webhook(req.paymentRawBody||req.body,req.get('Stripe-Signature')))));
    router.post('/payments/:operation/:record',express.json({limit:'1kb'}),wrap(async(req,res)=>{const user=await authorize(req,req.params.operation,'PATCH');await authorize(req,req.params.operation);res.json(await service.checkout(user,req.params.operation,req.params.record));}));
    router.get('/payments/status/:reference',wrap(async(req,res)=>{const user=await auth.authenticate(req.headers.authorization);const item=await service.status(user,req.params.reference);await authorize(req,item.operation);res.json(item);}));
  }
  if(enabled.includes('sso_oidc')) {
    const service=require('./integration-oidc').oidc({store,auth,stateStore:storage(path.join(process.env.APP_DATA_DIR||'./app-data','oidc'))});
    const cookie=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(part=>part.trim().split('=')));
    const options={httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV!=='test',path:'/api/integrations/sso',maxAge:5*60*1000};
    const {rateLimit}=require('express-rate-limit');router.use('/sso',rateLimit({windowMs:60000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}));
    router.get('/sso/start',wrap(async(req,res)=>{const browser=crypto.randomBytes(32).toString('base64url');const target=await service.start(browser);res.cookie('icase_oidc_browser',browser,options).redirect(target);}));
    router.get('/sso/callback',wrap(async(req,res)=>{const browser=cookie(req).icase_oidc_browser;const ticket=await service.callback({state:req.query.state,code:req.query.code,browser});const target=new URL(service.appUrl());target.hash='sso=complete';res.cookie('icase_oidc_ticket',ticket,{...options,maxAge:30000}).redirect(target.toString());}));
    router.post('/sso/session',wrap(async(req,res)=>{
      let origin;try{origin=new URL(process.env.OIDC_APP_URL).origin;}catch{throw new HttpError(503,'Configura URL de aplicación OIDC');}
      if(req.get('Origin')!==origin)throw new HttpError(403,'Origen SSO inválido');
      const cookies=cookie(req);const data=await service.exchange(cookies.icase_oidc_ticket,cookies.icase_oidc_browser);
      res.clearCookie('icase_oidc_ticket',options).clearCookie('icase_oidc_browser',options).set('Cache-Control','no-store').json(data);
    }));
  }
  if(enabled.includes('mapas'))router.get('/maps/:operation',wrap(async(req,res)=>{
    await authorize(req,req.params.operation);let binding;try{binding=JSON.parse(process.env.MAP_FIELDS||'{}')[req.params.operation];}catch{throw new HttpError(503,'Configuración de mapa inválida');}
    const schema=operations.get(req.params.operation).schema?.properties;
    if(!binding||!['integer','number'].includes(schema?.[binding.latitude]?.type)||!['integer','number'].includes(schema?.[binding.longitude]?.type))throw new HttpError(503,'Configura campos de coordenadas existentes y aprobados');
    const tile=process.env.MAP_TILE_URL,attribution=process.env.MAP_ATTRIBUTION;
    if(!tile||!attribution)throw new HttpError(503,'Configura proveedor de mapa y atribución');let url;try{url=new URL(tile.replace(/\{[xyzs]\}/g,'0'));}catch{throw new HttpError(503,'URL de mapa inválida');}
    if(url.protocol!=='https:'&&!(process.env.NODE_ENV==='test'&&url.protocol==='http:'))throw new HttpError(503,'El mapa requiere HTTPS');
    res.json({...binding,tile,attribution});
  }));
  app.use('/api/integrations',router);
  router.use((error,_req,res,_next)=>{const status=Number(error.status)>=400&&Number(error.status)<600?Number(error.status):500;res.status(status).json({message:status>=500&&!(error instanceof HttpError&&status===503)?'Integración no disponible; revisa su configuración y proveedor':error.message});});
};
