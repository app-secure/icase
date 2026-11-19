const fs=require('node:fs/promises'),path=require('node:path');
async function profile(root,manifest,web,project,exported=false) {
  const fixture=manifest.integraciones?.fixture;if(!fixture)return null;
  const enabled=manifest.integraciones.enabled;
  const operation=manifest.operations.find(operation=>operation.key===fixture.operation);if(!operation)throw new Error('Fixture cita una operación inexistente');
  const fields=operation.schema?.properties||{};
  if(enabled.includes('pagos_prueba')&&fields[fixture.amountField]?.type!=='integer')throw new Error('El fixture de pago requiere importe entero aprobado');
  if(enabled.includes('mapas')&&(!['number','integer'].includes(fields[fixture.latitude]?.type)||!['number','integer'].includes(fields[fixture.longitude]?.type)))throw new Error('El fixture de mapa requiere coordenadas aprobadas');
  await fs.writeFile(path.join(root,'provider.verify.cjs'),await fs.readFile(path.join(__dirname,'../templates/verification/provider-mock.cjs'),'utf8'));
  await fs.writeFile(path.join(root,'provider.verify.Dockerfile'),'FROM node:22-alpine\nWORKDIR /provider\nRUN npm install --ignore-scripts qrcode@1.5.4\nCOPY provider.verify.cjs ./\nUSER node\nCMD ["node","provider.verify.cjs"]\n');
  const environment={NODE_ENV:'test',STRIPE_SECRET_KEY:'sk_test_local',STRIPE_WEBHOOK_SECRET:'whsec_local',PAYMENT_NAMESPACE:'test-'+path.basename(root).replace(/[^a-zA-Z0-9_-]/g,'-'),STRIPE_API_BASE:'http://provider:8090',PAYMENT_RETURN_URL:web,PAYMENT_BINDINGS:JSON.stringify({[fixture.operation]:{amountField:fixture.amountField,currency:'usd'}}),OIDC_ISSUER:'http://provider:8090/oidc',OIDC_CLIENT_ID:'icase-test',OIDC_REDIRECT_URI:web+'/api/integrations/sso/callback',OIDC_APP_URL:web,OIDC_SUBJECTS:JSON.stringify({'http://provider:8090/oidc':{'demo-subject':'admin@example.test'}}),MAP_FIELDS:JSON.stringify({[fixture.operation]:{latitude:fixture.latitude,longitude:fixture.longitude}}),MAP_TILE_URL:'http://provider:8090/tiles/{z}/{x}/{y}.png',MAP_ATTRIBUTION:'Proveedor local de pruebas'};
  return {environment,service:`  provider:\n    build: { context: ${exported?'..':'.'}, dockerfile: provider.verify.Dockerfile }\n    environment: { PUBLIC_APP_URL: ${JSON.stringify(web)}, API_INTERNAL: "http://backend:3000" }\n${exported?'':'    networks: [verification]\n'}    mem_limit: 128m\n    pids_limit: 64\n    cap_drop: [ALL]\n    security_opt: ["no-new-privileges:true"]\n`,testEnvironment:{TEST_PROVIDER_URL:'http://provider:8090'},fixture};
}
module.exports={profile};
