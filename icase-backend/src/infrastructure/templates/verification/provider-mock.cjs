// Proveedor exclusivamente de pruebas aisladas. No desplegar como servicio público.
const http=require('node:http'),crypto=require('node:crypto');
const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'local-test-key',alg:'RS256',use:'sig'};
const codes=new Map(),sessions=new Map();
const issuer='http://provider:8090/oidc';
const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
const body=req=>new Promise((resolve,reject)=>{let data='';req.on('data',chunk=>{data+=chunk;if(data.length>65536){req.destroy();reject(new Error('body'));}});req.on('end',()=>resolve(data));});
const sign=claims=>{const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const text=part({alg:'RS256',kid:jwk.kid})+'.'+part(claims);return text+'.'+crypto.sign('RSA-SHA256',Buffer.from(text),privateKey).toString('base64url');};
http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://provider:8090');
  if(url.pathname==='/health')return reply(res,200,{status:'ok'});
  if(url.pathname==='/oidc/.well-known/openid-configuration')return reply(res,200,{issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/jwks'});
  if(url.pathname==='/oidc/jwks')return reply(res,200,{keys:[jwk]});
  if(url.pathname==='/oidc/authorize'){
    const input=Object.fromEntries(url.searchParams),redirect=new URL(input.redirect_uri);
    if(input.client_id!=='icase-test'||input.code_challenge_method!=='S256'||redirect.origin!==process.env.PUBLIC_APP_URL||redirect.pathname!=='/api/integrations/sso/callback')return reply(res,400,{error:'invalid_request'});
    const code=crypto.randomBytes(16).toString('hex');codes.set(code,{...input,expires:Date.now()+60000});redirect.search=new URLSearchParams({state:input.state,code}).toString();res.writeHead(302,{Location:redirect.toString()});return res.end();
  }
  if(url.pathname==='/oidc/token'){
    const input=Object.fromEntries(new URLSearchParams(await body(req))),flow=codes.get(input.code);codes.delete(input.code);
    if(!flow||flow.expires<Date.now()||input.client_id!==flow.client_id||input.redirect_uri!==flow.redirect_uri||crypto.createHash('sha256').update(input.code_verifier||'').digest('base64url')!==flow.code_challenge)return reply(res,400,{error:'invalid_grant'});
    const now=Math.floor(Date.now()/1000);return reply(res,200,{id_token:sign({iss:issuer,sub:'demo-subject',aud:input.client_id,nonce:flow.nonce,iat:now,exp:now+300}),token_type:'Bearer',access_token:'unused-local-token'});
  }
  if(url.pathname==='/v1/checkout/sessions'){
    if(req.headers.authorization!=='Bearer sk_test_local')return reply(res,401,{error:'invalid_key'});
    const input=Object.fromEntries(new URLSearchParams(await body(req))),key=req.headers['idempotency-key'];if(!key)return reply(res,400,{error:'missing_idempotency'});
    if(!sessions.has(key))sessions.set(key,{id:'cs_test_'+crypto.randomBytes(12).toString('hex'),livemode:false,amount_total:Number(input['line_items[0][price_data][unit_amount]']),currency:input['line_items[0][price_data][currency]'],metadata:{reference:input['metadata[reference]']}});
    const session=sessions.get(key);return reply(res,200,{...session,url:'http://provider:8090/checkout/'+session.id});
  }
  if(url.pathname.startsWith('/checkout/')){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<h1>Checkout local simulado: no se cobra dinero</h1>');}
  if(url.pathname==='/test/complete-payment'&&req.method==='POST'){
    const input=JSON.parse(await body(req)),session=[...sessions.values()].find(item=>item.id===input.session);if(!session)return reply(res,404,{error:'missing_session'});
    const data=Buffer.from(JSON.stringify({id:'evt_'+session.id,type:'checkout.session.completed',livemode:false,data:{object:{...session,payment_status:'paid'}}}));const timestamp=Math.floor(Date.now()/1000).toString(),signature=crypto.createHmac('sha256','whsec_local').update(timestamp+'.').update(data).digest('hex');
    const response=await fetch(process.env.API_INTERNAL+'/api/integrations/payments/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':'t='+timestamp+',v1='+signature},body:data});return reply(res,200,{status:response.status});
  }
  if(url.pathname==='/qr.png'){
    const png=await require('qrcode').toBuffer('qr-local-no-validado',{width:320,margin:4});res.writeHead(200,{'Content-Type':'image/png'});return res.end(png);
  }
  if(url.pathname.startsWith('/tiles/')){res.writeHead(200,{'Content-Type':'image/png','Access-Control-Allow-Origin':'*'});return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6HkAAAAAASUVORK5CYII=','base64'));}
  reply(res,404,{error:'not_found'});
}catch{reply(res,400,{error:'invalid_test_request'});}}).listen(8090,'0.0.0.0');
