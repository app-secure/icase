const fs = require('node:fs');
const path = require('node:path');

class ChangeEventsClientGenerator {
  apply(files, { auth }) {
    if (!auth) throw new Error('Eventos de cambios requiere autenticación JWT aprobada.');
    const client = fs.readFileSync(path.join(__dirname, '../templates/frontend/change-events-client.js'), 'utf8');
    for (const prefix of ['frontend', 'mobile']) {
      const pkg = files.find(file => file.ruta === `${prefix}/package.json`);
      if (!pkg) continue;
      const data = JSON.parse(pkg.contenido);
      data.dependencies['socket.io-client'] = '4.8.4';
      pkg.contenido = JSON.stringify(data, null, 2);
      files.push({ ruta: `${prefix}/${prefix === 'frontend' ? 'src/' : ''}change-events-client.js`, lenguaje: 'javascript', contenido: client });
    }
    const session = files.find(file => file.ruta === 'frontend/src/session.jsx');
    session.contenido = `import { subscribeChanges as subscribe } from './change-events-client';\n` + session.contenido;
    session.contenido = session.contenido.replace('  const value = useMemo', `  const subscribeChanges = useCallback((operation, onChange, onState) => {
    if (!token) return undefined;
    const dispose = subscribe({ token, operations: [operation], onChange, onState });
    const resume = () => dispose.resume();
    const offline = () => { dispose.pause(); onState?.('desconectado'); };
    window.addEventListener('online', resume);
    window.addEventListener('offline',offline);
    return () => { window.removeEventListener('online', resume); window.removeEventListener('offline',offline); dispose(); };
  }, [token]);
  const value = useMemo`)
      .replace('    loading,', '    loading,\n    subscribeChanges,')
      .replace(/\[loading, profile, api, login, register, logout(, ssoError)?\]/, (_match,sso)=>`[loading, profile, api, login, register, logout${sso||''}, subscribeChanges]`);
    for (const file of files.filter(file => /frontend\/src\/(Json)?OperationScreen\.jsx$/.test(file.ruta))) {
      file.contenido = file.contenido.replace('const { api, can } = useSession();', 'const { api, can, subscribeChanges } = useSession();\n  const [changesStatus, setChangesStatus] = useState("conectando");')
        .replace('useEffect(() => { refresh(); }, [refresh]);', `useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => subscribeChanges(capability, refresh, setChangesStatus), [subscribeChanges, capability, refresh]);`)
        .replace('{error &&', '<p aria-live="polite" data-testid="change-events-status">Canal de cambios: {changesStatus}</p>\n    {error &&');
    }
    const vite = files.find(file => file.ruta === 'frontend/vite.config.js');
    const relations=files.find(file=>file.ruta==='frontend/src/AssociationsPanel.jsx');
    relations.contenido=relations.contenido.replace("const { api } = useSession();","const { api, subscribeChanges } = useSession();\n  const [revision,setRevision]=useState(0);\n  useEffect(()=>subscribeChanges(operation,()=>setRevision(value=>value+1)),[subscribeChanges,operation]);")
      .replace('[api, operation, page, search]','[api, operation, page, search, revision]');
    relations.contenido=relations.contenido.replace("function RelationEditor({ relation, readable, writable }) {\n  const { api } = useSession();",`function RelationEditor({ relation, readable, writable }) {
  const {api,subscribeChanges}=useSession();
  const [revision,setRevision]=useState(0);
  const operation=relation.operations?.[0]?.[0];
  useEffect(()=>operation?subscribeChanges(operation,()=>setRevision(value=>value+1)):undefined,[subscribeChanges,operation]);`)
      .replace('[api, path, source]','[api, path, source, revision]');
    vite.contenido = vite.contenido.replace("proxy:{", "proxy:{'/socket.io':{target:'http://localhost:3000',ws:true},");
    const mobile = files.find(file => file.ruta === 'mobile/App.js');
    if (mobile) {
      files.push({ruta:'mobile/Associations.js',lenguaje:'javascript',contenido:fs.readFileSync(path.join(__dirname,'../templates/frontend/mobile-Associations.js'),'utf8')});
      mobile.contenido="import Associations from './Associations';\n"+mobile.contenido;
      mobile.contenido=mobile.contenido.replace('  const [operation,','  const [relations,setRelations]=useState([]);\n  const [changesRevision,setChangesRevision]=useState(0);\n  const [changesStatus,setChangesStatus]=useState("conectando");\n  const [operation,')
        .replace("const contract = await call('/api/contract');","const contract = await call('/api/contract');\n      setRelations(contract.associations||[]);");
      mobile.contenido=mobile.contenido.replace('{records.map((item, index) => <Text key={item.id || item._id || index}>{JSON.stringify(item)}</Text>)}','{records.map((item,index)=><React.Fragment key={item.id||item._id||index}><Text>{JSON.stringify(item)}</Text></React.Fragment>)}')
        .replace('{JSON.stringify(item)}</Text>','{JSON.stringify(item)}</Text><Associations relations={relations} operation={operation} record={item} call={call} revision={changesRevision} permissions={permisos}/>');
      mobile.contenido = `import { subscribeChanges } from './change-events-client';\n` + mobile.contenido;
      mobile.contenido = mobile.contenido.replace('import { Button,', 'import { AppState, Button,')
        .replace('  const signIn = async', `  useEffect(() => {
    if (!token || !operation?.key) return undefined;
    const dispose = subscribeChanges({ url: API, token, operations: [operation.key], onState:setChangesStatus, onChange: async()=>{await load();setChangesRevision(value=>value+1);}, active: AppState.currentState === 'active' });
    const listener = AppState.addEventListener('change', state => state === 'active' ? dispose.resume() : dispose.pause());
    return () => { listener.remove(); dispose(); };
  }, [token, operation?.key, load]);

  const signIn = async`);
      mobile.contenido=mobile.contenido.replace('{records.map(', '<Text accessibilityLiveRegion="polite">Canal de cambios: {changesStatus}</Text>\n    {records.map(');
    }
    const manifest = files.find(file => file.ruta === 'frontend/icase.manifest.json');
    const data = JSON.parse(manifest.contenido);
    data.modulos.eventos_cambios = true;
    data.eventos_cambios = { experimental: true, web: true, mobile: Boolean(mobile), recovery: 'HTTP refetch on reconnect', multiReplica: false };
    manifest.contenido = JSON.stringify(data, null, 2);
    return files;
  }
}
module.exports = ChangeEventsClientGenerator;
