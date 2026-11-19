const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {HttpError}=require('../data/store-support');
const {hashPassword}=require('../auth/auth-core');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function createRecovery({store,root,send,publicUrl,now=()=>Date.now()}) {
  let queue=Promise.resolve();
  const locked=work=>{const next=queue.then(work);queue=next.catch(()=>{});return next;};
  const directory=path.resolve(root);
  return {
    async request(email) {
      const start=now();
      if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400,'Correo inválido');
      await locked(async()=>{
        await fs.mkdir(directory,{recursive:true,mode:0o700});
        const names=await fs.readdir(directory);
        for(const name of names) if(/^[a-f0-9]{64}$/.test(name)) {
          const meta=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
          if(meta.expires<=now()) await fs.unlink(path.join(directory,name));
        }
        if(names.length>=5000) return; // Respuesta genérica, sin almacenamiento ilimitado.
        const user=await store.findUserByEmail(email.trim().toLowerCase());
        if(!user||user.activo===false) return;
        for(const name of names)if(/^[a-f0-9]{64}$/.test(name)) {
          let meta;try{meta=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));}catch(error){if(error.code==='ENOENT')continue;throw error;}
          if(meta.user===String(user.id)&&meta.expires>now()+14*60*1000)return;
        }
        const token=crypto.randomBytes(32).toString('hex');
        const file=path.join(directory,hash(token));
        await fs.writeFile(file,JSON.stringify({user:String(user.id),expires:now()+15*60*1000,password:hash(user.password_hash)}),{flag:'wx',mode:0o600});
        const link=new URL(publicUrl);link.hash='reset='+token;
        try { await send({to:user.email,subject:'Restablecer contraseña',text:'Usa este enlace en los próximos 15 minutos. Si no lo solicitaste, ignóralo.\n'+link.toString()}); }
        catch { await fs.unlink(file); console.warn('No se pudo entregar el correo de recuperación.'); }
      });
      const remaining=250-(now()-start);if(remaining>0) await new Promise(resolve=>setTimeout(resolve,remaining));
      return {message:'Si la cuenta existe y está activa, recibirás un enlace de recuperación.'};
    },
    reset(token,password) { return locked(async()=>{
      if(!/^[a-f0-9]{64}$/.test(String(token))||typeof password!=='string'||password.length<8||password.length>128) throw new HttpError(400,'Enlace o contraseña inválidos');
      const file=path.join(directory,hash(token));let meta;
      try{meta=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')throw new HttpError(400,'Enlace inválido o caducado');throw error;}
      const user=await store.findUserById(meta.user);
      if(meta.expires<=now()||!user||user.activo===false||hash(user.password_hash)!==meta.password) throw new HttpError(400,'Enlace inválido o caducado');
      const previous=user.password_hash;
      const password_hash=await hashPassword(password);
      try{await fs.unlink(file);}catch(error){if(error.code==='ENOENT')throw new HttpError(400,'Enlace inválido o caducado');throw error;}
      // Compare-and-set en la base: no sobrescribe un cambio concurrente de contraseña/desactivación.
      if(!await store.replacePassword(user.id,previous,password_hash))throw new HttpError(400,'Enlace inválido o caducado');
      return {message:'Contraseña actualizada. Inicia sesión nuevamente.'};
    });}
  };
}
function configuredRecovery(store) {
  const env=process.env;
  if(!env.SMTP_HOST||!env.SMTP_FROM||!env.RESET_PUBLIC_URL) throw new HttpError(503,'Recuperación de cuentas no configurada');
  let url;try{url=new URL(env.RESET_PUBLIC_URL);}catch{throw new HttpError(503,'Recuperación de cuentas no configurada');}
  const insecure=env.SMTP_ALLOW_INSECURE==='true'&&env.NODE_ENV!=='production';
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&env.NODE_ENV!=='production')) throw new HttpError(503,'La recuperación requiere HTTPS');
  const transport=require('nodemailer').createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:env.SMTP_SECURE==='true',requireTLS:!insecure,connectionTimeout:5000,socketTimeout:10000,...(env.SMTP_USER?{auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}}:{})});
  return createRecovery({store,root:path.join(env.APP_DATA_DIR||'./app-data','recovery'),publicUrl:url.toString(),send:mail=>transport.sendMail({from:env.SMTP_FROM,...mail})});
}
module.exports={createRecovery,configuredRecovery};
