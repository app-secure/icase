const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {promisify}=require('node:util'),{execFile}=require('node:child_process');
const {generate}=require('./verify-specialized-runtime');
async function main(){
 const address=process.argv[2]||Object.values(os.networkInterfaces()).flat().find(item=>item.family==='IPv4'&&!item.internal&&!/^(169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address))?.address;
 if(!address||!/^\d+\.\d+\.\d+\.\d+$/.test(address))throw new Error('Indica la IPv4 LAN accesible desde el teléfono');
 const root=path.resolve(__dirname,'../verification-results/mobile-preview');await fs.mkdir(root,{recursive:true});
 const {artifact}=await generate('realtime','Express');
 for(const file of artifact.archivos){const target=path.join(root,file.ruta);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,file.contenido);}
 const env='JWT_SECRET=mobile-preview-isolated-only-not-production\nADMIN_EMAIL=mobile@example.test\nADMIN_PASSWORD=Mobile-Preview-Only-123!\nDB_NAME=mobile_preview\nDB_USER=mobile_preview\nDB_PASSWORD=mobile-preview-database-only\nDB_ROOT_PASSWORD=mobile-preview-root-only\nEVENTS_NAMESPACE=mobile-preview-local-isolated\n';
 await fs.writeFile(path.join(root,'.preview.env'),env);
 await fs.writeFile(path.join(root,'preview.yml'),`services:\n  backend:\n    ports: !override ["${address}:43170:3000"]\n    environment:\n      CORS_ORIGINS: http://${address}:43171,http://${address}:43170\n  frontend:\n    ports: !override ["${address}:43171:80"]\n`);
 await fs.writeFile(path.join(root,'mobile/.env'),'EXPO_PUBLIC_API_URL=http://'+address+':43170\n');
 await fs.writeFile(path.join(root,'.gitignore'),'node_modules/\n**/node_modules/\n*.env\n**/.env\n');
 const run=promisify(execFile),compose=['compose','-p','icase-mobile-preview','--env-file','.preview.env','-f','ops/docker-compose.yml','-f','preview.yml'];
 await run('docker',[...compose,'up','-d','--build','database','redis','backend','frontend'],{cwd:root,timeout:900000,maxBuffer:4*1024*1024});
 const api='http://'+address+':43170';let token;
 for(let attempt=0;attempt<60&&!token;attempt++){try{const result=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'mobile@example.test',password:'Mobile-Preview-Only-123!'})});if(result.ok)token=(await result.json()).token;}catch{}if(!token)await new Promise(resolve=>setTimeout(resolve,1000));}
 if(!token)throw new Error('La API móvil no quedó disponible');
 for(const [operation,body] of [['rf-01',{nombre:'Autor de prueba'}],['rf-02',{titulo:'Libro de prueba'}]]){const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'},rows=await(await fetch(api+'/api/operations/'+operation,{headers})).json();if(!rows.length)await fetch(api+'/api/operations/'+operation,{method:'POST',headers,body:JSON.stringify(body)});}
 const uri='exp://'+address+':43172';await fs.writeFile(path.join(root,'expo-go.png'),await require('qrcode').toBuffer(uri,{width:360,margin:3}));
 console.log(JSON.stringify({root,api,web:'http://'+address+':43171',expo:uri,email:'mobile@example.test',password:'Mobile-Preview-Only-123!',stop:'docker compose -p icase-mobile-preview --env-file .preview.env -f ops/docker-compose.yml -f preview.yml down'},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
