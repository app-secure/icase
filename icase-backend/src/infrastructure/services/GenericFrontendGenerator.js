const slug = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pantalla';
const component = (value) => slug(value).split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');

class GenericFrontendGenerator {
  generate({ proyecto, screens, decisiones = {}, sistemaDiseno = {} }) {
    const platforms = decisiones.alcance_plataforma?.plataformas || decisiones.stack_tecnologico?.plataformas || ['web'];
    const colors = sistemaDiseno.colores || {};
    const views = screens.map((screen) => this._view(screen));
    const files = [
      { ruta: 'frontend/package.json', lenguaje: 'json', contenido: JSON.stringify({ name: `${slug(proyecto.nombre)}-frontend`, version: '1.0.0', private: true, type: 'module', scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build', preview: 'vite preview --host 0.0.0.0' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', 'react-router-dom': '^7.0.0' }, devDependencies: { '@vitejs/plugin-react': '^5.0.0', vite: '^7.0.0' } }, null, 2) },
      { ruta: 'frontend/vite.config.js', lenguaje: 'javascript', contenido: "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({plugins:[react()],server:{proxy:{'/api':'http://localhost:3000','/health':'http://localhost:3000'}}});\n" },
      { ruta: 'frontend/index.html', lenguaje: 'html', contenido: `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${this._escape(proyecto.nombre)}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>` },
      { ruta: 'frontend/src/main.jsx', lenguaje: 'javascript', contenido: "import React from 'react';\nimport{createRoot}from'react-dom/client';\nimport{BrowserRouter}from'react-router-dom';\nimport App from './App';\nimport './styles.css';\ncreateRoot(document.getElementById('root')).render(<BrowserRouter><App/></BrowserRouter>);\n" },
      { ruta: 'frontend/src/OperationScreen.jsx', lenguaje: 'javascript', contenido: this._operationScreen() },
      { ruta: 'frontend/src/styles.css', lenguaje: 'css', contenido: `:root{font-family:Inter,system-ui,sans-serif;color:${colors.texto || '#0f172a'};background:${colors.fondo || '#f8fafc'};--primary:${colors.primario || '#6d28d9'}}*{box-sizing:border-box}body{margin:0}.nav{display:flex;gap:1rem;flex-wrap:wrap;padding:1rem;background:white;border-bottom:1px solid #ddd}.screen{max-width:1050px;margin:auto;padding:2rem}.card{background:white;border:1px solid #dbe1ea;border-radius:12px;padding:1rem;margin:1rem 0}.field{width:100%;min-height:7rem;padding:.75rem;font:inherit}.button{border:0;border-radius:8px;padding:.65rem 1rem;margin:.25rem;background:var(--primary);color:white}.danger{background:#b91c1c}.tabs{display:flex;gap:.5rem;flex-wrap:wrap}.tabs button{background:#ede9fe;color:#4c1d95}.record{white-space:pre-wrap;background:#f8fafc;padding:.75rem;border-radius:8px}.error{color:#b91c1c}.success{color:#047857}` },
      { ruta: 'frontend/icase.manifest.json', lenguaje: 'json', contenido: JSON.stringify({ project: proyecto.nombre, mode: 'generic_contract_v1', plataformas_solicitadas: platforms, pantallas: views }, null, 2) }
    ];
    const imports = [];
    const routes = [];
    for (const view of views) {
      const name = component(view.id);
      imports.push(`import ${name} from './pages/${view.id}';`);
      routes.push(`<Route path=${JSON.stringify(view.route)} element={<${name}/>}/>`);
      const screen = screens.find((item) => this._view(item).id === view.id);
      const reference = this._plainText(screen?.mockup?.preview_code || '').slice(0, 600);
      files.push({ ruta: `frontend/src/pages/${view.id}.jsx`, lenguaje: 'javascript', contenido: `import React from 'react';\nimport OperationScreen from '../OperationScreen';\nconst referenceText=${JSON.stringify(reference)};\nexport default function ${name}(){return <OperationScreen title=${JSON.stringify(view.name)} capabilities={${JSON.stringify(view.operations)}} referenceText={referenceText}/>;}\n` });
      if (screen?.mockup?.preview_code) files.push({ ruta: `frontend/mockups-reference/${view.id}.html`, lenguaje: 'html', contenido: screen.mockup.preview_code });
    }
    const first = views[0]?.route || '/';
    files.push({ ruta: 'frontend/src/App.jsx', lenguaje: 'javascript', contenido: `import React from 'react';\nimport{Link,Navigate,Route,Routes}from'react-router-dom';\n${imports.join('\n')}\nexport default function App(){return <><nav className="nav"><strong>${this._escape(proyecto.nombre)}</strong>${views.map((view) => `<Link to=${JSON.stringify(view.route)}>${this._escape(view.name)}</Link>`).join('')}</nav><Routes>${routes.join('')}<Route path="*" element={<Navigate to=${JSON.stringify(first)} replace/>}/></Routes></>}\n` });
    if (platforms.some((item) => /m[oó]vil|android|ios|react native/i.test(item))) files.push(...this._mobile(proyecto.nombre));
    return files;
  }

  _view(screen) {
    const rf = screen.rf_trazabilidad || screen.mockup?.rf_trazabilidad || [];
    const id = slug(screen.slug || screen.nombre || screen.nombre_pantalla);
    const route = String(screen.ruta || '').trim();
    return { id, name: screen.nombre || screen.nombre_visible || screen.nombre_pantalla || id, route: route.startsWith('/') ? route : `/${route || id}`, roles: screen.roles || [], requirements: rf, operations: rf.map(slug) };
  }

  _operationScreen() {
    return `import React,{useCallback,useEffect,useState}from'react';
async function request(path,options={}){const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'Solicitud fallida');return data}
export default function OperationScreen({title,capabilities,referenceText}){const[capability,setCapability]=useState(capabilities[0]||'');const[records,setRecords]=useState([]);const[payload,setPayload]=useState('{\\n  "valor": ""\\n}');const[message,setMessage]=useState('');const[error,setError]=useState('');const refresh=useCallback(async()=>{if(!capability){setRecords([]);return}try{setRecords(await request('/api/operations/'+encodeURIComponent(capability)));setError('')}catch(e){setError(e.message)}},[capability]);useEffect(()=>{refresh()},[refresh]);const parse=()=>{const value=JSON.parse(payload);if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('Los datos deben ser un objeto JSON');return value};const create=async()=>{try{await request('/api/operations/'+encodeURIComponent(capability),{method:'POST',body:JSON.stringify(parse())});setMessage('Registro creado');setError('');await refresh()}catch(e){setError(e.message)}};const update=async(id)=>{try{await request('/api/operations/'+encodeURIComponent(capability)+'/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(parse())});setMessage('Registro actualizado');await refresh()}catch(e){setError(e.message)}};const remove=async(id)=>{try{await request('/api/operations/'+encodeURIComponent(capability)+'/'+encodeURIComponent(id),{method:'DELETE'});setMessage('Registro eliminado');await refresh()}catch(e){setError(e.message)}};return <main className="screen" data-screen={capability||'sin-operacion'}><h1>{title}</h1>{referenceText&&<p>{referenceText}</p>}{capabilities.length>1&&<div className="tabs">{capabilities.map(value=><button className="button" key={value} onClick={()=>setCapability(value)}>{value}</button>)}</div>}{!capability&&<p className="error">Esta pantalla no tiene RF asociado; corrige la trazabilidad antes de aprobarla.</p>}{error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status" className="success">{message}</p>}{capability&&<section className="card"><label>Datos de la operación<textarea aria-label="Datos JSON" className="field" value={payload} onChange={event=>setPayload(event.target.value)}/></label><button className="button" onClick={create}>Crear</button><button className="button" onClick={refresh}>Actualizar lista</button></section>}<section className="card"><h2>Registros</h2>{records.map(record=><article key={record.id||record._id} className="record">{JSON.stringify(record,null,2)}<div><button className="button" onClick={()=>update(record.id||record._id)}>Modificar</button><button className="button danger" onClick={()=>remove(record.id||record._id)}>Eliminar</button></div></article>)}</section></main>}
`;
  }

  _mobile(name) {
    return [
      { ruta: 'mobile/package.json', lenguaje: 'json', contenido: JSON.stringify({ name: `${slug(name)}-mobile`, version: '1.0.0', private: true, main: 'node_modules/expo/AppEntry.js', scripts: { start: 'expo start', 'export:android': 'expo export --platform android' }, dependencies: { expo: '~57.0.0', react: '19.2.3', 'react-native': '0.86.0' } }, null, 2) },
      { ruta: 'mobile/app.json', lenguaje: 'json', contenido: JSON.stringify({ expo: { name, slug: slug(name), version: '1.0.0', platforms: ['android', 'ios'] } }, null, 2) },
      { ruta: 'mobile/.env.example', lenguaje: 'dotenv', contenido: 'EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3000\n' },
      { ruta: 'mobile/App.js', lenguaje: 'javascript', contenido: `import React,{useEffect,useState}from'react';import{Button,SafeAreaView,ScrollView,StyleSheet,Text,TextInput}from'react-native';const API=process.env.EXPO_PUBLIC_API_URL;export default function App(){const[contract,setContract]=useState(null);const[records,setRecords]=useState([]);const[payload,setPayload]=useState('{"valor":""}');const[error,setError]=useState('');const capability=contract?.operations?.[0]?.key;const call=async(path,options)=>{const response=await fetch(API+path,{...options,headers:{'Content-Type':'application/json'}});const data=await response.json();if(!response.ok)throw new Error(data.message||'Error');return data};const load=async()=>{try{const c=contract||await call('/api/contract');if(!contract)setContract(c);if(c.operations[0])setRecords(await call(c.operations[0].collectionPath));setError('')}catch(e){setError(e.message)}};useEffect(()=>{load()},[]);const create=async()=>{try{await call('/api/operations/'+capability,{method:'POST',body:JSON.stringify(JSON.parse(payload))});await load()}catch(e){setError(e.message)}};return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.body}><Text style={styles.title}>${this._escape(name)}</Text>{error&&<Text>{error}</Text>}<TextInput multiline style={styles.input} value={payload} onChangeText={setPayload}/><Button title="Crear" onPress={create} disabled={!capability}/>{records.map((item,index)=><Text key={item.id||item._id||index}>{JSON.stringify(item)}</Text>)}</ScrollView></SafeAreaView>}const styles=StyleSheet.create({root:{flex:1},body:{padding:20,gap:12},title:{fontSize:24,fontWeight:'700'},input:{borderWidth:1,padding:12,minHeight:100}});` }
    ];
  }

  _plainText(html) { return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  _escape(value) { return String(value || '').replace(/[<>&{}]/g, ''); }
}

module.exports = GenericFrontendGenerator;
