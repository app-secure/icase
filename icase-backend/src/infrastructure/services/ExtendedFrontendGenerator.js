const fs=require('node:fs');
const path=require('node:path');
const ModuleService=require('../../core/services/ModuleService');
class ExtendedFrontendGenerator {
  apply(files,{decisiones}) {
    const enabled=new ModuleService().activos(decisiones.modulos);
    const read=name=>fs.readFileSync(path.join(__dirname,'../templates/frontend',name),'utf8');
    if (!enabled.some(id=>['archivos_imagenes','reportes_calculos','recuperacion_cuentas'].includes(id))) return files;
    if(decisiones.control_acceso?.autenticacion?.metodo!=='jwt') throw new Error('Los módulos extendidos requieren JWT aprobado.');
    const session=files.find(file=>file.ruta==='frontend/src/session.jsx');
    session.contenido=session.contenido.replace('const data = await response.json().catch(() => ({}));',"const data = response.ok && options.responseType === 'blob' ? await response.blob() : await response.json().catch(() => ({}));");
    if(enabled.includes('archivos_imagenes')) {
      files.push({ruta:'frontend/src/FilesPanel.jsx',lenguaje:'javascript',contenido:read('FilesPanel.jsx')});
      for(const file of files.filter(file=>/frontend\/src\/(Json)?OperationScreen\.jsx$/.test(file.ruta))) {
        file.contenido="import FilesPanel from './FilesPanel';\n"+file.contenido;
        file.contenido=file.contenido.replace('<td>','<td><FilesPanel operation={capability} record={record.id || record._id}/>')
          .replace('<div>\n          {can(capability,', '<div><FilesPanel operation={capability} record={record.id || record._id}/>\n          {can(capability,');
      }
      const mobile=files.find(file=>file.ruta==='mobile/App.js');
      if(mobile) {
        const pkg=files.find(file=>file.ruta==='mobile/package.json'); const data=JSON.parse(pkg.contenido);
        Object.assign(data.dependencies,{'expo-document-picker':'58.0.4','expo-file-system':'58.0.13','expo-sharing':'58.0.21'});pkg.contenido=JSON.stringify(data,null,2);
        mobile.contenido="import * as DocumentPicker from 'expo-document-picker';\nimport * as FileSystem from 'expo-file-system/legacy';\nimport * as Sharing from 'expo-sharing';\n"+mobile.contenido;
        mobile.contenido=mobile.contenido.replace("...(token ? { Authorization: `Bearer ${token}` } : {})", "...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers");
        mobile.contenido=mobile.contenido.replace('  const signIn = async',`  const upload = async id => {
    try {
      const selected=await DocumentPicker.getDocumentAsync({type:['image/png','image/jpeg','application/pdf'],copyToCacheDirectory:true});
      if(selected.canceled) return;
      const file=selected.assets[0]; if(file.size>524288) throw new Error('Máximo 512 KiB');
      const bytes=await (await fetch(file.uri)).blob();
      await call('/api/files/'+operation.key+'/'+id,{method:'POST',headers:{'Content-Type':file.mimeType,'X-File-Name':encodeURIComponent(file.name)},body:bytes});
      setError('Archivo adjuntado');
    } catch(failure){setError(failure.message);}
  };
  const shareFiles = async id => {
    try {
      const list=await call('/api/files/'+operation.key+'/'+id);
      for(const file of list) {
        const local=FileSystem.cacheDirectory+file.id;
        try {
          const result=await FileSystem.downloadAsync(API+'/api/download/'+file.id,local,{headers:{Authorization:'Bearer '+token}});
          if(result.status!==200) throw new Error('No se pudo descargar el archivo');
          if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(local,{mimeType:file.type});
        } finally {await FileSystem.deleteAsync(local,{idempotent:true});}
      }
      if(!list.length)setError('No hay archivos adjuntos');
    } catch(failure){setError(failure.message);}
  };
  const signIn = async`);
        mobile.contenido=mobile.contenido.replace("{records.map((item, index) => <Text key={item.id || item._id || index}>{JSON.stringify(item)}</Text>)}", "{records.map((item,index)=><React.Fragment key={item.id || item._id || index}><Text>{JSON.stringify(item)}</Text>{can('PATCH') && <Button title=\"Adjuntar archivo\" onPress={()=>upload(item.id || item._id)}/>}<Button title=\"Descargar adjuntos\" onPress={()=>shareFiles(item.id || item._id)}/></React.Fragment>)}");
      }
    }
    if(enabled.includes('reportes_calculos')) {
      files.push({ruta:'frontend/src/ReportsPanel.jsx',lenguaje:'javascript',contenido:read('ReportsPanel.jsx')});
      for(const file of files.filter(file=>/frontend\/src\/(Json)?OperationScreen\.jsx$/.test(file.ruta))) {
        file.contenido="import ReportsPanel from './ReportsPanel';\n"+file.contenido;
        file.contenido=file.contenido.replace('{error &&','<ReportsPanel operation={capability}/>\n    {error &&');
      }
    }
    if(enabled.includes('recuperacion_cuentas')) {
      files.push({ruta:'frontend/src/RecoveryPanel.jsx',lenguaje:'javascript',contenido:read('RecoveryPanel.jsx')});
      const login=files.find(file=>file.ruta==='frontend/src/LoginScreen.jsx');
      login.contenido="import RecoveryPanel from './RecoveryPanel';\n"+login.contenido.replace('</main>','<RecoveryPanel/></main>');
      const app=files.find(file=>file.ruta==='frontend/src/App.jsx');
      app.contenido="import RecoveryPanel from './RecoveryPanel';\n"+app.contenido.replace('export default function App() {',`export default function App() {
  const [recovering]=React.useState(()=>new URLSearchParams(window.location.hash.slice(1)).has('reset'));
  `).replace('const { user, loading, can, logout } = useSession();','const { user, loading, can, logout } = useSession();\n  if(recovering)return <main className="screen"><RecoveryPanel/><a href="/">Volver a la aplicación</a></main>;');
    }
    return files;
  }
}
module.exports=ExtendedFrontendGenerator;
