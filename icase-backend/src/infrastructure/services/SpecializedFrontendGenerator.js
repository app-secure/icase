const fs=require('node:fs'),path=require('node:path');
const ModuleService=require('../../core/services/ModuleService');
class SpecializedFrontendGenerator {
  apply(files,{decisiones}) {
    const enabled=new ModuleService().activos(decisiones.modulos),read=name=>fs.readFileSync(path.join(__dirname,'../templates/frontend',name),'utf8');
    if(enabled.some(id=>['pagos_prueba','sso_oidc','mapas','camara_qr'].includes(id))&&decisiones.control_acceso?.autenticacion?.metodo!=='jwt')throw new Error('Integraciones especializadas requieren JWT aprobado.');
    const pkg=files.find(file=>file.ruta==='frontend/package.json'),data=JSON.parse(pkg.contenido);
    for(const [id,name,dependency] of [['mapas','MapRecord',['leaflet','1.9.4']],['pagos_prueba','PaymentRecord',null],['camara_qr','QRScanner',['jsqr','1.4.0']]])if(enabled.includes(id)){
      if(dependency)data.dependencies[dependency[0]]=dependency[1];
      files.push({ruta:'frontend/src/'+name+'.jsx',lenguaje:'javascript',contenido:read(name+'.jsx')});
      for(const file of files.filter(file=>/frontend\/src\/(Json)?OperationScreen\.jsx$/.test(file.ruta))){
        file.contenido=`import ${name} from './${name}';\n`+file.contenido;
        if(id==='camara_qr')file.contenido=file.contenido.replace('{error &&','<QRScanner onRead={value=>{setSearch(value);setPage(1);}}/>\n    {error &&');
        else file.contenido=file.contenido.replace('<td>',`<td><${name} operation={capability} record={record}/>`).replace('{JSON.stringify(record, null, 2)}',`{JSON.stringify(record, null, 2)}<${name} operation={capability} record={record}/>`);
      }
    }
    pkg.contenido=JSON.stringify(data,null,2);
    if(enabled.includes('sso_oidc')){
      const login=files.find(file=>file.ruta==='frontend/src/LoginScreen.jsx');if(!login)throw new Error('SSO requiere JWT aprobado');
      login.contenido=login.contenido.replace('</main>','<a href="/api/integrations/sso/start">Ingresar con SSO</a></main>');
      const session=files.find(file=>file.ruta==='frontend/src/session.jsx');
      session.contenido=session.contenido.replace("  const [profile, setProfile] = useState(null);","  const [profile, setProfile] = useState(null);\n  const [ssoError,setSsoError]=useState('');")
        .replace('setToken(null); setProfile(null);','setToken(null); setProfile(null); setSsoError(\'\');')
        .replace('    loading,','    loading,\n    ssoError,').replace('[loading, profile, api, login, register, logout]','[loading, profile, api, login, register, logout, ssoError]');
      login.contenido=login.contenido.replace('const { login, register }','const { login, register, ssoError }').replace('{error &&','{ssoError && <p role="alert">{ssoError}</p>}\n      {error &&');
      session.contenido=session.contenido.replace('  const register = useCallback',`  useEffect(()=>{
    if(window.location.hash!=='#sso=complete')return;
    history.replaceState(null,'',window.location.pathname+window.location.search);
    let active=true;
    request('/api/integrations/sso/session',{method:'POST'}).then(({response,data})=>{if(!active)return;if(response.ok){storage.set(data.token);setProfile({usuario:data.usuario,permisos:data.permisos});setToken(data.token);}else setSsoError(data.message||'No se pudo completar SSO');}).catch(()=>{if(active)setSsoError('No se pudo conectar con SSO');});
    return ()=>{active=false;};
  },[]);
  const register = useCallback`);
    }
    const mobile=files.find(file=>file.ruta==='mobile/App.js');
    if(mobile&&enabled.includes('camara_qr')){
      files.push({ruta:'mobile/QRScanner.js',lenguaje:'javascript',contenido:read('mobile-QR.js')});
      mobile.contenido="import QRScanner from './QRScanner';\n"+mobile.contenido.replace('    {records.map','    <QRScanner/>\n    {records.map');
      const pkg=files.find(file=>file.ruta==='mobile/package.json'),data=JSON.parse(pkg.contenido);data.dependencies['expo-camera']='58.0.14';pkg.contenido=JSON.stringify(data,null,2);
      const config=files.find(file=>file.ruta==='mobile/app.json'),app=JSON.parse(config.contenido);app.expo.plugins=[...(app.expo.plugins||[]),['expo-camera',{cameraPermission:'Permite usar la cámara para leer códigos QR.',recordAudioAndroid:false}]];config.contenido=JSON.stringify(app,null,2);
    }
    return files;
  }
}
module.exports=SpecializedFrontendGenerator;
