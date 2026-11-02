// Diagnóstico local: no hace solicitudes externas ni imprime valores de configuración.
function check({enabled=[],operations=[],env=process.env}) {
  const results=[];
  const add=(module,code,ok)=>results.push({module,code,status:ok?'correcto':'error'});
  const object=value=>{try{const parsed=JSON.parse(value||'{}');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;}catch{return null;}};
  const url=value=>{try{const u=new URL(value);return !u.username&&!u.password&&!u.hash&&(u.protocol==='https:'||(env.NODE_ENV==='test'&&u.protocol==='http:'))&&!u.hostname.endsWith('.example');}catch{return false;}};
  const operation=key=>operations.find(item=>item.key===key);
  if(enabled.includes('pagos_prueba')) {
    add('pagos_prueba','STRIPE_SECRET_KEY_TEST',/^sk_test_[A-Za-z0-9_]+$/.test(env.STRIPE_SECRET_KEY||''));
    add('pagos_prueba','STRIPE_WEBHOOK_SECRET',/^whsec_\S+$/.test(env.STRIPE_WEBHOOK_SECRET||''));
    add('pagos_prueba','PAYMENT_NAMESPACE',/^[a-zA-Z0-9:_-]{16,120}$/.test(env.PAYMENT_NAMESPACE||''));
    add('pagos_prueba','PAYMENT_RETURN_URL',url(env.PAYMENT_RETURN_URL));
    add('pagos_prueba','STRIPE_API_BASE',!env.STRIPE_API_BASE||(env.NODE_ENV==='test'&&url(env.STRIPE_API_BASE)));
    const bindings=object(env.PAYMENT_BINDINGS);
    add('pagos_prueba','PAYMENT_BINDINGS',!!bindings&&Object.keys(bindings).length>0&&Object.entries(bindings).every(([key,b])=>b&&operation(key)?.schema?.properties?.[b.amountField]?.type==='integer'&&/^[a-z]{3}$/.test(b.currency||'')));
  }
  if(enabled.includes('sso_oidc')) {
    for(const key of ['OIDC_ISSUER','OIDC_REDIRECT_URI','OIDC_APP_URL'])add('sso_oidc',key,url(env[key]));
    add('sso_oidc','OIDC_CLIENT_ID',typeof env.OIDC_CLIENT_ID==='string'&&env.OIDC_CLIENT_ID.trim().length>0);
    const subjects=object(env.OIDC_SUBJECTS),mapping=subjects?.[env.OIDC_ISSUER];
    add('sso_oidc','OIDC_SUBJECTS',!!mapping&&typeof mapping==='object'&&!Array.isArray(mapping)&&Object.keys(mapping).length>0&&Object.entries(mapping).every(([sub,email])=>sub.length>0&&sub.length<=255&&typeof email==='string'&&email.trim().length>0));
    let sameOrigin=false;try{sameOrigin=new URL(env.OIDC_APP_URL).origin===new URL(env.OIDC_REDIRECT_URI).origin;}catch{}
    add('sso_oidc','OIDC_SAME_ORIGIN_COOKIE',sameOrigin);
  }
  if(enabled.includes('mapas')) {
    const fields=object(env.MAP_FIELDS);
    add('mapas','MAP_FIELDS',!!fields&&Object.keys(fields).length>0&&Object.entries(fields).every(([key,f])=>f&&f.latitude!==f.longitude&&['integer','number'].includes(operation(key)?.schema?.properties?.[f.latitude]?.type)&&['integer','number'].includes(operation(key)?.schema?.properties?.[f.longitude]?.type)));
    add('mapas','MAP_TILE_URL',url(env.MAP_TILE_URL)&&['{z}','{x}','{y}'].every(value=>env.MAP_TILE_URL.includes(value)));
    add('mapas','MAP_ATTRIBUTION',typeof env.MAP_ATTRIBUTION==='string'&&env.MAP_ATTRIBUTION.trim().length>0);
  }
  if(enabled.includes('camara_qr'))results.push({module:'camara_qr',code:'DEVICE_PERMISSION_AND_CAMERA_REQUIRE_MANUAL_TEST',status:'pendiente'});
  return {ready:results.every(item=>item.status!=='error'),scope:'configuracion_local_sin_contactar_proveedores',results};
}
module.exports={check};
