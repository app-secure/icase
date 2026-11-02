const crypto=require('node:crypto');
const {HttpError}=require('../data/store-support');
const {hash}=require('./integration-storage');
function payments({store,ledger,operations,env=process.env,fetcher=fetch}) {
  const configured=()=>{
    if(!/^sk_test_[A-Za-z0-9_]+$/.test(env.STRIPE_SECRET_KEY||'')||!env.STRIPE_WEBHOOK_SECRET||!env.PAYMENT_RETURN_URL||!/^[a-zA-Z0-9:_-]{16,120}$/.test(env.PAYMENT_NAMESPACE||''))throw new HttpError(503,'Configura Stripe test, namespace único y URL de retorno');
    const url=new URL(env.PAYMENT_RETURN_URL);
    if(url.protocol!=='https:'&&!(env.NODE_ENV==='test'&&url.protocol==='http:'))throw new HttpError(503,'Se requiere HTTPS');
    if(env.STRIPE_API_BASE&&env.NODE_ENV!=='test')throw new HttpError(503,'El proveedor simulado solo se permite en pruebas');
    return env.STRIPE_API_BASE||'https://api.stripe.com';
  };
  return {
    checkout(user,key,id){return ledger.lock(async()=>{
      const base=configured(),operation=operations.find(operation=>operation.key===key);
      let binding;try{binding=JSON.parse(env.PAYMENT_BINDINGS||'{}')[key];}catch{throw new HttpError(503,'Configuración de pagos inválida');}
      if(!operation||!binding||operation.schema?.properties?.[binding.amountField]?.type!=='integer'||!/^[a-z]{3}$/.test(binding.currency||''))throw new HttpError(503,'Configura importe entero en unidades menores y moneda sobre campos aprobados');
      const record=await store.getRecord(key,id);if(!record)throw new HttpError(404,'Registro inexistente');
      const amount=(record.data||record)[binding.amountField];
      if(!Number.isSafeInteger(amount)||amount<1||amount>99999999)throw new HttpError(422,'Importe fuera de rango');
      const reference=hash(env.PAYMENT_NAMESPACE+':'+key+':'+id),old=await ledger.get(reference);
      if(old&&(old.owner!==String(user.id)||old.amount!==amount||old.currency!==binding.currency))throw new HttpError(409,'Ya existe una solicitud incompatible para este registro');
      if(old?.url)return old;
      const pending=old||{reference,operation:key,record:String(id),owner:String(user.id),amount,currency:binding.currency,status:'pending'};
      await ledger.put(reference,pending);
      const form=new URLSearchParams({mode:'payment','payment_method_types[0]':'card','line_items[0][quantity]':'1','line_items[0][price_data][currency]':binding.currency,'line_items[0][price_data][unit_amount]':String(amount),'line_items[0][price_data][product_data][name]':'Solicitud '+key,'metadata[reference]':reference,success_url:env.PAYMENT_RETURN_URL,cancel_url:env.PAYMENT_RETURN_URL});
      const response=await fetcher(base+'/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':reference},body:form,signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new HttpError(502,'El proveedor de pagos no pudo crear la sesión');
      const data=await response.json();let checkout;try{checkout=new URL(data.url);}catch{throw new HttpError(502,'Respuesta inválida del proveedor');}
      if(data.livemode!==false||typeof data.id!=='string'||(checkout.origin!=='https://checkout.stripe.com'&&!(env.NODE_ENV==='test'&&checkout.origin===new URL(base).origin)))throw new HttpError(502,'El proveedor no devolvió un checkout de pruebas válido');
      const result={...pending,session:data.id,url:checkout.toString()};await ledger.put(reference,result);return result;
    });},
    async status(user,reference){const item=await ledger.get(reference);if(!item||item.owner!==String(user.id)&&user.rol!=='administrador')throw new HttpError(404,'Solicitud inexistente');return item;},
    webhook(bytes,signature){return ledger.lock(async()=>{
      configured();if(!Buffer.isBuffer(bytes)||bytes.length>65536||typeof signature!=='string'||signature.length>4096)throw new HttpError(400,'Firma inválida');
      const parts=signature.split(',').map(value=>value.split('=')),timestamp=parts.find(([key])=>key==='t')?.[1],signatures=parts.filter(([key])=>key==='v1').map(([,value])=>value);
      if(!/^\d{10}$/.test(timestamp||'')||Math.abs(Date.now()/1000-Number(timestamp))>300)throw new HttpError(400,'Firma caducada');
      const digest=crypto.createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.').update(bytes).digest();
      if(!signatures.slice(0,10).some(value=>/^[a-f0-9]{64}$/.test(value)&&crypto.timingSafeEqual(digest,Buffer.from(value,'hex'))))throw new HttpError(400,'Firma inválida');
      let event;try{event=JSON.parse(bytes.toString());}catch{throw new HttpError(400,'Evento inválido');}
      if(event.livemode!==false)throw new HttpError(400,'Solo se aceptan eventos de prueba');
      if(event.type!=='checkout.session.completed')return {received:true};
      const session=event.data?.object,reference=session?.metadata?.reference;if(!/^[a-f0-9]{64}$/.test(reference||''))throw new HttpError(400,'Referencia inválida');
      const item=await ledger.get(reference);
      if(!item||item.session!==session.id||session.amount_total!==item.amount||session.currency!==item.currency||session.payment_status!=='paid')throw new HttpError(400,'El evento no coincide con el pago esperado');
      if(item.status!=='paid')await ledger.put(reference,{...item,status:'paid',event:event.id});
      return {received:true};
    });}
  };
}
module.exports={payments};
