const express=require('express');
const {engine}=require('./business-process');
const {repository}=require('./business-process-pg');
module.exports=(app,{store,auth,definitions,outbox=false})=>{
  store.processOutboxEnabled=outbox;
  if(outbox)store.startProcessOutbox=()=>{
    const worker=require('./business-process-outbox').createWorker({pool:store.pool,publish:key=>{if(typeof store.notifyProcessChange!=='function')throw new Error('transport_unavailable');return store.notifyProcessChange(key);},onError:code=>console.warn(code)});
    return ()=>worker.stop();
  };
  const router=express.Router(),service=engine({definitions,repository:repository(store),authorize:(...args)=>auth.authorize(...args)});
  const wrap=handler=>async(req,res,next)=>{try{const user=await auth.authenticate(req.headers.authorization);res.set('Cache-Control','no-store');await handler(req,res,user);}catch(error){next(error);}};
  router.get('/definitions',wrap(async(req,res,user)=>res.json(service.catalog(user))));
  router.get('/instances',wrap(async(req,res,user)=>res.json(await service.list(user,req.query.page===undefined?1:Number(req.query.page)))));
  router.post('/:definition/instances',express.json({limit:'8kb'}),wrap(async(req,res,user)=>res.status(201).json(await service.start(user,req.params.definition,req.body.records))));
  router.get('/instances/:id',wrap(async(req,res,user)=>res.json(await service.read(user,req.params.id))));
  router.post('/instances/:id/actions',express.json({limit:'8kb'}),wrap(async(req,res,user)=>res.json(await service.act(user,req.params.id,req.body))));
  router.use((error,req,res,next)=>{if(res.headersSent)return next(error);const status=[400,401,403,404,409,422,503].includes(error.status)?error.status:500;res.status(status).json({message:status===500?'No se pudo ejecutar el proceso':error.message});});
  app.use('/api/processes',router);
};
