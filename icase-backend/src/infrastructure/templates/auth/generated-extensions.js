const express = require('express');
const path = require('node:path');
const { HttpError } = require('../data/store-support');

module.exports = function mountExtensions(app, { store, auth, contract, enabled }) {
  const router = express.Router();
  const operations = new Map(contract.operations.map(operation => [operation.key, operation]));
  const policy = require('../auth/policy');
  const { scopeOf } = require('../auth/ownership');
  const wrap = handler => async (req,res,next) => { try { await handler(req,res,next); } catch(error) { next(error); } };
  const access = async (req,key,method) => {
    if (!operations.has(key)) throw new HttpError(404,'Operación inexistente');
    const user = await auth.authenticate(req.headers.authorization);
    auth.authorize(user,method,'/api/operations/'+key);
    return user;
  };
  const recordExists = async (operation,id,user) => {
    if (!await store.getRecord(operation,id,scopeOf(policy,user,operation))) throw new HttpError(404,'Registro inexistente');
  };
  if(enabled.includes('recuperacion_cuentas')) {
    const {rateLimit}=require('express-rate-limit');
    const limited=rateLimit({windowMs:60*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false});
    let recovery;
    const service=()=>recovery||(recovery=require('./generated-recovery').configuredRecovery(store));
    router.post('/auth/forgot-password',limited,express.json({limit:'8kb'}),wrap(async(req,res)=>res.status(202).json(await service().request(req.body?.email))));
    router.post('/auth/reset-password',limited,express.json({limit:'8kb'}),wrap(async(req,res)=>res.json(await service().reset(req.body?.token,req.body?.password))));
  }
  if (enabled.includes('archivos_imagenes')) {
    const files = require('./generated-files').createFiles({ root:path.join(process.env.APP_DATA_DIR || './app-data','files') });
    if(typeof store.remove==='function') {
      const remove=store.remove.bind(store);
      store.remove=async(operation,id)=>{
        const result=await remove(operation,id);
        if(result)for(const [key,value] of operations)if(key===operation||(value.entity&&value.entity===operations.get(operation)?.entity)) {
          try{for(const file of await files.list(key,id))await files.remove(file.id);}catch{console.warn('No se pudieron purgar todos los adjuntos del registro eliminado.');}
        }
        return result;
      };
    }
    router.post('/files/:operation/:record',wrap(async(req,res,next) => {
      req.fileUser = await access(req,req.params.operation,'PATCH');
      await recordExists(req.params.operation,req.params.record,req.fileUser);
      next();
    }), express.raw({type:()=>true,limit:512*1024}),wrap(async(req,res) => {
      let name; try { name=decodeURIComponent(req.get('X-File-Name') || 'archivo'); } catch { throw new HttpError(400,'Nombre inválido'); }
      const file = await files.save({ operation:req.params.operation,record:req.params.record,owner:req.fileUser.id,name,bytes:req.body,type:req.get('Content-Type')?.split(';')[0] });
      res.status(201).json(file);
    }));
    router.get('/files/:operation/:record',wrap(async(req,res) => {
      const user=await access(req,req.params.operation,'GET'); await recordExists(req.params.operation,req.params.record,user);
      res.json(await files.list(req.params.operation,req.params.record));
    }));
    // Las rutas de descarga tienen dos segmentos; registrar antes del listado genérico.
    router.get('/download/:id',wrap(async(req,res) => {
      const file = await files.get(req.params.id);
      const user=await access(req,file.operation,'GET'); await recordExists(file.operation,file.record,user);
      res.set({'Content-Type':file.type,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}).send(await files.read(file.id));
    }));
    router.delete('/download/:id',wrap(async(req,res) => {
      const file = await files.get(req.params.id);
      const user=await access(req,file.operation,'PATCH'); await recordExists(file.operation,file.record,user);
      await files.remove(file.id); res.json({deleted:true});
    }));
  }
  if(enabled.includes('reportes_calculos')) {
    router.get('/reports/:operation',wrap(async(req,res)=>{
      const user=await access(req,req.params.operation,'GET');
      const format=req.query.format || 'json';
      if(!['json','csv','pdf'].includes(format)) throw new HttpError(400,'Formato inválido');
      const data=await require('./generated-reports').report(store,operations.get(req.params.operation),scopeOf(policy,user,req.params.operation));
      res.set('Cache-Control','private, no-store');
      if(format==='json') return res.json(data);
      if(format==='csv') return res.type('text/csv').attachment('reporte.csv').send('\ufeff'+require('./generated-reports').csv([data.columns,...data.rows.map(row=>data.columns.map(key=>row[key]))]));
      const PDF=require('pdfkit'); const pdf=new PDF({margin:40});
      const chunks=[];pdf.on('data',chunk=>chunks.push(chunk));
      const ready=new Promise((resolve,reject)=>{pdf.on('end',resolve);pdf.on('error',reject);});
      pdf.fontSize(16).text('Reporte: '+operations.get(req.params.operation).name);
      pdf.fontSize(10).text('Registros: '+data.count).text(data.consistency);
      for(const [name,total] of Object.entries(data.totals)) pdf.text(name+': '+JSON.stringify(total));
      for(const row of data.rows) pdf.text(JSON.stringify(row));
      pdf.end();await ready;res.type('application/pdf').attachment('reporte.pdf').send(Buffer.concat(chunks));
    }));
  }
  app.use('/api',router);
  // Errores de extensiones sanitizados, sin rutas de disco ni detalles SMTP/SQL.
  router.use((error,_req,res,_next) => {
    const status = Number(error.status) >= 400 && Number(error.status) < 500 ? Number(error.status) : 500;
    res.status(status).json({message:status===500?'Error interno del servidor':error.message});
  });
};
