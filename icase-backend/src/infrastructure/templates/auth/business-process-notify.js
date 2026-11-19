const {HttpError}=require('../data/store-support');

function smtpConfigured(){
  return Boolean(String(process.env.SMTP_HOST||'').trim()&&String(process.env.SMTP_FROM||'').trim());
}

function transport(){
  if(!smtpConfigured())throw new HttpError(503,'SMTP no configurado: no se puede notificar esta transición');
  const insecure=process.env.SMTP_ALLOW_INSECURE==='true';
  return require('nodemailer').createTransport({
    host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',
    requireTLS:!insecure,connectionTimeout:5000,socketTimeout:10000,
    ...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}:{})
  });
}

async function recipients(store,roles){
  const users=await store.listUsers();
  return users.filter(user=>user.activo!==false&&roles.includes(user.rol)&&user.email).map(user=>({email:user.email,rol:user.rol}));
}

async function sendActionMail({store,notify,definition,action,instance,from,to}){
  if(!notify)return;
  const wanted=Array.isArray(notify.roles)?notify.roles:[];
  if(!wanted.length)return;
  const mailer=transport();
  const people=await recipients(store,wanted);
  if(!people.length)return;
  const subject=`Proceso ${definition}: ${action}`;
  const text=`La acción «${action}» del proceso «${definition}» pasó de «${from}» a «${to}» (instancia ${instance}).`;
  await mailer.sendMail({from:process.env.SMTP_FROM,to:people.map(item=>item.email).join(','),subject,text});
}

module.exports={smtpConfigured,sendActionMail};
