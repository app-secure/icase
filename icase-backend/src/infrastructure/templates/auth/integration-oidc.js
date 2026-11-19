const crypto=require('node:crypto');
const {HttpError}=require('../data/store-support');
const {hash}=require('./integration-storage');
const random=()=>crypto.randomBytes(32).toString('base64url');
function oidc({store,auth,stateStore,env=process.env,fetcher=fetch,joseLoader=()=>import('jose')}) {
  let metadata;
  function url(value){let result;try{result=new URL(value);}catch{throw new HttpError(503,'Configuración OIDC inválida');}if(result.protocol!=='https:'&&!(env.NODE_ENV==='test'&&result.protocol==='http:'))throw new HttpError(503,'OIDC requiere HTTPS');if(result.username||result.password)throw new HttpError(503,'URL OIDC inválida');return result;}
  async function config(){
    if(!env.OIDC_ISSUER||!env.OIDC_CLIENT_ID||!env.OIDC_REDIRECT_URI||!env.OIDC_APP_URL)throw new HttpError(503,'Configura emisor, cliente, callback y URL de aplicación OIDC');
    url(env.OIDC_REDIRECT_URI);url(env.OIDC_APP_URL);const issuer=url(env.OIDC_ISSUER);
    if(!metadata){
      const response=await fetcher(env.OIDC_ISSUER.replace(/\/$/,'')+'/.well-known/openid-configuration',{signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw new HttpError(502,'Proveedor de identidad no disponible');const data=await response.json();
      if(data.issuer!==env.OIDC_ISSUER)throw new HttpError(502,'El emisor OIDC no coincide');
      for(const field of ['authorization_endpoint','token_endpoint','jwks_uri']){const endpoint=url(data[field]);if(endpoint.protocol==='http:'&&endpoint.origin!==issuer.origin)throw new HttpError(503,'Endpoint de pruebas fuera del emisor');}
      const jose=await joseLoader();metadata={...data,jose,jwks:jose.createRemoteJWKSet(new URL(data.jwks_uri))};
    }
    return metadata;
  }
  return {
    async start(browser){
      const meta=await config(),state=random(),nonce=random(),verifier=random();
      await stateStore.put(hash(state),{browser:hash(browser),nonce,verifier,expires:Date.now()+5*60*1000});
      const target=new URL(meta.authorization_endpoint);
      target.search=new URLSearchParams({response_type:'code',client_id:env.OIDC_CLIENT_ID,redirect_uri:env.OIDC_REDIRECT_URI,scope:'openid',state,nonce,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
      return target.toString();
    },
    async callback({state,code,browser}){
      if(!/^[a-zA-Z0-9_-]{43}$/.test(state||'')||typeof code!=='string'||code.length>2048||typeof browser!=='string')throw new HttpError(400,'Callback OIDC inválido');
      const pending=await stateStore.consume(hash(state));
      if(!pending||pending.expires<Date.now()||pending.browser!==hash(browser))throw new HttpError(400,'Estado OIDC inválido o caducado');
      const meta=await config();
      const form=new URLSearchParams({grant_type:'authorization_code',client_id:env.OIDC_CLIENT_ID,redirect_uri:env.OIDC_REDIRECT_URI,code,code_verifier:pending.verifier});
      if(env.OIDC_CLIENT_SECRET)form.set('client_secret',env.OIDC_CLIENT_SECRET);
      const response=await fetcher(meta.token_endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new HttpError(401,'El proveedor rechazó la autenticación');const data=await response.json();
      let claims;try{claims=(await meta.jose.jwtVerify(data.id_token,meta.jwks,{issuer:env.OIDC_ISSUER,audience:env.OIDC_CLIENT_ID,algorithms:['RS256','ES256'],requiredClaims:['exp','iat','sub','nonce'],maxTokenAge:'10m'})).payload;}catch{throw new HttpError(401,'ID token inválido');}
      if(claims.nonce!==pending.nonce||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255||((claims.azp!==undefined||Array.isArray(claims.aud)&&claims.aud.length>1)&&claims.azp!==env.OIDC_CLIENT_ID))throw new HttpError(401,'Identidad OIDC inválida');
      let subjects;try{subjects=JSON.parse(env.OIDC_SUBJECTS||'{}');}catch{throw new HttpError(503,'Configura identidades OIDC preautorizadas');}
      const issuerSubjects=Object.prototype.hasOwnProperty.call(subjects,env.OIDC_ISSUER)?subjects[env.OIDC_ISSUER]:null;
      const email=issuerSubjects&&Object.prototype.hasOwnProperty.call(issuerSubjects,claims.sub)?issuerSubjects[claims.sub]:null;
      if(typeof email!=='string')throw new HttpError(403,'Identidad externa no preautorizada');
      const user=await store.findUserByEmail(email);if(!user||user.activo===false)throw new HttpError(403,'Cuenta local no habilitada');
      const ticket=random();await stateStore.put(hash(ticket),{browser:hash(browser),user:String(user.id),expires:Date.now()+30000});return ticket;
    },
    async exchange(ticket,browser){
      if(!/^[a-zA-Z0-9_-]{43}$/.test(ticket||'')||typeof browser!=='string')throw new HttpError(401,'Sesión SSO inválida');
      const session=await stateStore.consume(hash(ticket));if(!session||session.expires<Date.now()||session.browser!==hash(browser))throw new HttpError(401,'Sesión SSO inválida');
      const user=await store.findUserById(session.user);if(!user||user.activo===false)throw new HttpError(403,'Cuenta local no habilitada');
      return {token:auth.issue(user),usuario:auth.publicUser(user),permisos:auth.permissionsOf(user)};
    },
    appUrl:()=>url(env.OIDC_APP_URL).toString()
  };
}
module.exports={oidc};
