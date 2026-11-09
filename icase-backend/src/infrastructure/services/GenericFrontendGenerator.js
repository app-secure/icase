const fs = require('node:fs');
const path = require('node:path');

const renderTemplate = require('./renderTemplate');
const ModuleService = require('../../core/services/ModuleService');
const MobileRuntime = require('../../core/constants/MobileRuntime');

const HtmlToJsxTransformer = require('./HtmlToJsxTransformer');

const TEMPLATES = path.join(__dirname, '..', 'templates', 'frontend');
const template = (name) => fs.readFileSync(path.join(TEMPLATES, name), 'utf8');

const slug = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pantalla';
const component = (value) => slug(value).split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
const STOPWORDS = new Set(['vista', 'pantalla', 'panel', 'modulo', 'seccion', 'pagina', 'inicio', 'listado', 'detalle', 'gestion', 'registro', 'edicion', 'consulta', 'para', 'del', 'las', 'los', 'una', 'con', 'por']);
const tokensOf = (value) => slug(value).split('-').filter((w) => w.length >= 3 && !STOPWORDS.has(w));
const isAuthScreen = (screen) => /inicio.*sesion|login|autentic/i.test(screen?.slug || screen?.nombre || screen?.nombre_visible || screen?.nombre_pantalla || screen?.ruta || '');

// Estilos del módulo de formularios por campo y diseño moderno tipo Dashboard.
const TYPED_FORMS_CSS = '.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem}.form-row{display:flex;flex-direction:column;gap:.35rem}.input{width:100%;padding:.65rem .85rem;font:inherit;font-size:.9rem;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;transition:border-color .15s,box-shadow .15s;outline:none}.input:focus{border-color:var(--primary);background:white;box-shadow:0 0 0 3px rgba(99,102,241,.15)}.input[aria-invalid="true"]{border-color:#ef4444;background:#fef2f2}.field-error{color:#dc2626;font-size:.8rem;font-weight:500}.secondary{background:#f1f5f9!important;color:#334155!important;border:1px solid #cbd5e1!important}.secondary:hover{background:#e2e8f0!important}.table-wrap{overflow-x:auto;border-radius:10px;border:1px solid #e2e8f0;margin-top:.75rem}.records{width:100%;border-collapse:collapse;font-size:.875rem}.records th{background:#f8fafc;color:#475569;font-weight:600;text-transform:uppercase;font-size:.75rem;letter-spacing:.05em;padding:.75rem 1rem;border-bottom:1px solid #e2e8f0}.records td{padding:.85rem 1rem;border-bottom:1px solid #f1f5f9;color:#1e293b;vertical-align:middle}.records tr:last-child td{border-bottom:none}.records tr:hover{background:#f8fafc}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}';

class GenericFrontendGenerator {
  generate({ proyecto, screens, decisiones = {}, sistemaDiseno = {}, requerimientos = [] }) {
    const platforms = decisiones.alcance_plataforma?.plataformas || decisiones.stack_tecnologico?.plataformas || ['web'];
    const colors = sistemaDiseno.colores || {};
    const views = screens.map((screen) => this._view(screen, screens, requerimientos));
    const acceso = decisiones.control_acceso || null;
    const auth = acceso?.autenticacion?.metodo === 'jwt';
    const openRoles = auth ? (acceso.roles || []).filter((role) => role.incluir !== false && role.autoregistro === true).map((role) => ({ id: role.id, nombre: role.nombre })) : [];
    const typedForms = new ModuleService().activos(decisiones.modulos).includes('formularios_tipados');
    const files = [
      { ruta: 'frontend/package.json', lenguaje: 'json', contenido: JSON.stringify({ name: `${slug(proyecto.nombre)}-frontend`, version: '1.0.0', private: true, type: 'module', scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build', preview: 'vite preview --host 0.0.0.0' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', 'react-router-dom': '^7.0.0' }, devDependencies: { '@vitejs/plugin-react': '^5.0.0', vite: '^7.0.0' } }, null, 2) },
      { ruta: 'frontend/vite.config.js', lenguaje: 'javascript', contenido: "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({plugins:[react()],server:{proxy:{'/api':'http://localhost:3000','/health':'http://localhost:3000'}}});\n" },
      { ruta: 'frontend/index.html', lenguaje: 'html', contenido: `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${this._escape(proyecto.nombre)}</title><script src="https://cdn.tailwindcss.com"></script><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body { font-family: 'Inter', sans-serif; }</style></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>` },
      { ruta: 'frontend/src/main.jsx', lenguaje: 'javascript', contenido: "import React from 'react';\nimport{createRoot}from'react-dom/client';\nimport{BrowserRouter}from'react-router-dom';\nimport { SessionProvider } from './session';\nimport App from './App';\nimport './styles.css';\ncreateRoot(document.getElementById('root')).render(<SessionProvider><BrowserRouter><App/></BrowserRouter></SessionProvider>);\n" },
      ...(typedForms ? [
        { ruta: 'frontend/src/OperationScreen.jsx', lenguaje: 'javascript', contenido: template('OperationScreen.typed.jsx') },
        { ruta: 'frontend/src/JsonOperationScreen.jsx', lenguaje: 'javascript', contenido: template('OperationScreen.jsx') }
      ] : [{ ruta: 'frontend/src/OperationScreen.jsx', lenguaje: 'javascript', contenido: template('OperationScreen.jsx') }]),
      { ruta: 'frontend/src/session.jsx', lenguaje: 'javascript', contenido: template(auth ? 'session-auth.jsx' : 'session-open.jsx') },
      { ruta: 'frontend/src/AssociationsPanel.jsx', lenguaje: 'javascript', contenido: template('AssociationsPanel.jsx') },
      ...(auth ? [
        { ruta: 'frontend/src/LoginScreen.jsx', lenguaje: 'javascript', contenido: renderTemplate(template('LoginScreen.jsx'), { REGISTRO: JSON.stringify(openRoles) }) },
        { ruta: 'frontend/src/UsersScreen.jsx', lenguaje: 'javascript', contenido: template('UsersScreen.jsx') }
      ] : []),
      { ruta: 'frontend/src/styles.css', lenguaje: 'css', contenido: `:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${colors.texto || '#0f172a'};background:#f1f5f9;--primary:${colors.primario || '#4f46e5'};--primary-hover:#4338ca}*{box-sizing:border-box}body{margin:0;background:#f1f5f9;color:#0f172a;line-height:1.5}.app-shell{min-height:100vh;display:flex;flex-direction:column}.nav{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;padding:.75rem 1.75rem;background:white;border-bottom:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,.04)}.nav-brand{font-size:1.15rem;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:.5rem;text-decoration:none}.nav-links{display:flex;align-items:center;gap:.5rem;overflow-x:auto;padding:.25rem 0}.nav-link{text-decoration:none;color:#475569;font-size:.875rem;font-weight:500;padding:.45rem .85rem;border-radius:6px;transition:all .15s;white-space:nowrap}.nav-link:hover{background:#f1f5f9;color:#0f172a}.nav-link.active{background:#ede9fe;color:#4f46e5;font-weight:600}.nav-user{display:flex;align-items:center;gap:1rem;font-size:.875rem;color:#475569}.user-badge{background:#f1f5f9;padding:.35rem .75rem;border-radius:9999px;font-weight:500;border:1px solid #e2e8f0}.screen{max-width:1200px;width:100%;margin:1.5rem auto;padding:0 1.5rem}.screen h1{font-size:1.65rem;font-weight:700;color:#0f172a;margin:0 0 1rem 0;letter-spacing:-.02em}.card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:1.5rem;margin:1.25rem 0;box-shadow:0 1px 3px rgba(0,0,0,.03)}.card h2{font-size:1.15rem;font-weight:600;margin:0 0 1rem 0;color:#1e293b}.field{width:100%;min-height:2.65rem;padding:.6rem .85rem;font:inherit;font-size:.9rem;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;outline:none;transition:border-color .15s}.field:focus{border-color:var(--primary);background:white}.button{border:0;border-radius:8px;padding:.55rem 1.15rem;font-size:.875rem;font-weight:500;cursor:pointer;background:var(--primary);color:white;transition:opacity .15s,transform .05s;display:inline-flex;align-items:center;gap:.5rem}.button:hover{opacity:.92}.button:active{transform:scale(.98)}.button:disabled{opacity:.5;cursor:not-allowed}.danger{background:#ef4444!important}.danger:hover{background:#dc2626!important}.tabs{display:flex;gap:.5rem;margin-bottom:1rem}.tabs button{background:#e2e8f0;color:#334155}.tabs button.active{background:var(--primary);color:white}.record{white-space:pre-wrap;background:#f8fafc;padding:1rem;border-radius:8px;border:1px solid #e2e8f0}.error{color:#dc2626;background:#fef2f2;border:1px solid #fecaca;padding:.75rem 1rem;border-radius:8px;font-size:.875rem}.success{color:#059669;background:#ecfdf5;border:1px solid #a7f3d0;padding:.75rem 1rem;border-radius:8px;font-size:.875rem}${typedForms ? TYPED_FORMS_CSS : ''}` },
      { ruta: 'frontend/icase.manifest.json', lenguaje: 'json', contenido: JSON.stringify({ project: proyecto.nombre, mode: 'generic_contract_v1', modulos: { formularios_tipados: typedForms }, plataformas_solicitadas: platforms, auth: { habilitada: auth, registro: openRoles }, pantallas: views }, null, 2) }
    ];
    const imports = [];
    const routes = [];
    for (const view of views) {
      if (auth && (view.route === '/usuarios' || view.id === 'usuarios' || view.name?.toLowerCase() === 'usuarios')) continue;
      const name = component(view.id);
      imports.push(`import ${name} from './pages/${view.id}';`);
      routes.push(`<Route path=${JSON.stringify(view.route)} element={<${name}/>}/>`);
      const screen = screens.find((item) => this._view(item, screens, requerimientos).id === view.id);
      const reference = this._plainText(screen?.mockup?.preview_code || '').slice(0, 600);
      const mockupCode = screen?.mockup?.preview_code;
      const jsxBody = mockupCode ? HtmlToJsxTransformer.transform(mockupCode) : '';

      files.push({
        ruta: `frontend/src/pages/${view.id}.jsx`,
        lenguaje: 'javascript',
        contenido: `import React, { useState } from 'react';\nimport OperationScreen from '../OperationScreen';\nconst referenceText=${JSON.stringify(reference)};\nexport default function ${name}(){\n  const [showCrud, setShowCrud] = useState(false);\n  return (\n    <main className="page-container screen" data-screen=${JSON.stringify(view.id)}>\n      ${jsxBody ? `<div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', gap: '0.75rem', alignItems: 'center' }}>\n        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Vista:</span>\n        <button type="button" className={'button' + (!showCrud ? '' : ' secondary')} style={{ padding: '0.35rem 0.85rem', fontSize: '0.82rem' }} onClick={() => setShowCrud(false)}>✨ Interfaz Diseñada</button>\n        <button type="button" className={'button' + (showCrud ? '' : ' secondary')} style={{ padding: '0.35rem 0.85rem', fontSize: '0.82rem' }} onClick={() => setShowCrud(true)}>⚙️ Gestión de Datos (API)</button>\n      </div>` : ''}\n      ${jsxBody ? `{!showCrud ? (\n        <div className="mockup-view-wrapper" style={{ minHeight: 'calc(100vh - 120px)' }}>\n          <div className="mockup-content">${jsxBody}</div>\n        </div>\n      ) : (\n        <OperationScreen title=${JSON.stringify(view.name)} capabilities={${JSON.stringify(view.operations)}} referenceText={referenceText} asChild />\n      )}` : `<OperationScreen title=${JSON.stringify(view.name)} capabilities={${JSON.stringify(view.operations)}} referenceText={referenceText} asChild />`}\n    </main>\n  );\n}\n`
      });
      if (screen?.mockup?.preview_code) files.push({ ruta: `frontend/mockups-reference/${view.id}.html`, lenguaje: 'html', contenido: screen.mockup.preview_code });
    }
    const first = views[0]?.route || '/';
    files.push({ ruta: 'frontend/src/App.jsx', lenguaje: 'javascript', contenido: auth ? this._appWithAuth(proyecto, views, imports, routes) : this._app(proyecto, views, imports, routes, first) });
    if (platforms.some((item) => /m[oó]vil|android|ios|react native/i.test(item))) files.push(...this._mobile(proyecto.nombre, auth));
    if(new ModuleService().activos(decisiones.modulos).includes('procesos_negocio')){
      if(!auth)throw new Error('La bandeja de procesos requiere JWT');
      if(views.some(view=>view.route==='/procesos'))throw new Error('La ruta /procesos está reservada para la bandeja de procesos');
      files.push({ruta:'frontend/src/ProcessScreen.jsx',lenguaje:'javascript',contenido:template('ProcessScreen.jsx')});
      const app=files.find(file=>file.ruta==='frontend/src/App.jsx');
      app.contenido="import ProcessScreen from './ProcessScreen';\n"+app.contenido;
      app.contenido=app.contenido.replace('<Routes>','<Routes><Route path="/procesos" element={<ProcessScreen/>}/>')
        .replace('<span>{user.nombre','<Link to="/procesos">Procesos</Link><span>{user.nombre');
      const mobileApp=files.find(file=>file.ruta==='mobile/App.js');
      if(mobileApp){
        files.push({ruta:'mobile/ProcessScreen.js',lenguaje:'javascript',contenido:template('mobile-ProcessScreen.js')});
        mobileApp.contenido="import ProcessScreen from './ProcessScreen';\n"+mobileApp.contenido
          .replace("const [error, setError] = useState('');","const [error, setError] = useState('');\n  const [screen, setScreen] = useState('crud');")
          .replace('{AUTH && <Button title="Cerrar sesión" onPress={() => { setToken(null); setPermisos(null); }} />}','{AUTH && <Button title="Procesos" onPress={() => setScreen(screen === \'procesos\' ? \'crud\' : \'procesos\')} />}\n    {screen === \'procesos\' ? <ProcessScreen api={call} token={token} /> : null}\n    {AUTH && <Button title="Cerrar sesión" onPress={() => { setToken(null); setPermisos(null); setScreen(\'crud\'); }} />}');
      }
    }
    const extended = new (require('./SpecializedFrontendGenerator'))().apply(new (require('./ExtendedFrontendGenerator'))().apply(files,{decisiones}),{decisiones});
    return new ModuleService().activos(decisiones.modulos).includes('eventos_cambios')
      ? new (require('./ChangeEventsClientGenerator'))().apply(extended, { auth }) : extended;
  }

  _view(screen, screens = [], requerimientos = []) {
    const directRf = screen.rf_trazabilidad || screen.mockup?.rf_trazabilidad || [];
    const rf = directRf.length ? directRf : this._inferScreenRfs(screen, screens, requerimientos);
    const id = slug(screen.slug || screen.nombre || screen.nombre_pantalla);
    const route = String(screen.ruta || '').trim();
    const modulo = screen.modulo || screen.mockup?.modulo || 'General';
    return { id, name: screen.nombre || screen.nombre_visible || screen.nombre_pantalla || id, route: route.startsWith('/') ? route : `/${route || id}`, roles: screen.roles || [], requirements: rf, operations: rf.map(slug), modulo };
  }

  _inferScreenRfs(screen, screens = [], requerimientos = []) {
    if (!screen || isAuthScreen(screen)) return [];
    const screenTokens = tokensOf(screen.nombre || screen.nombre_visible || screen.nombre_pantalla || screen.slug || '');
    const siblings = (screens || []).filter((item) => item !== screen && (item.rf_trazabilidad || item.mockup?.rf_trazabilidad || []).length > 0);
    const functionalReqs = (requerimientos || []).filter((req) => (req.tipo || 'funcional') !== 'no_funcional' && (req.codigo || req.id_requerimiento));
    if (!siblings.length && !functionalReqs.length) return [];

    const tokenMatchScore = (candidateTokens) => {
      let score = 0;
      for (const st of screenTokens) {
        if (candidateTokens.includes(st)) score += 10;
        else if (st.length >= 4 && candidateTokens.some((ct) => ct.length >= 4 && (ct.startsWith(st.slice(0, 4)) || st.startsWith(ct.slice(0, 4))))) score += 5;
      }
      return score;
    };

    const matchedReqCodes = functionalReqs
      .map((req) => {
        const titleScore = tokenMatchScore(tokensOf(req.titulo || req.nombre || '')) * 2;
        const descScore = tokenMatchScore(tokensOf(req.descripcion || ''));
        return { code: req.codigo || req.id_requerimiento, score: titleScore + descScore };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.code);

    const scoredSiblings = siblings
      .map((sib) => {
        const sibRfs = sib.rf_trazabilidad || sib.mockup?.rf_trazabilidad || [];
        const nameScore = tokenMatchScore(tokensOf(sib.nombre || sib.nombre_visible || sib.nombre_pantalla || sib.slug || ''));
        const roleScore = (screen.roles || []).filter((r) => (sib.roles || []).includes(r)).length * 2;
        const modScore = screen.modulo && screen.modulo === sib.modulo ? 3 : 0;
        return { rfs: sibRfs, nameScore, totalScore: nameScore + roleScore + modScore };
      })
      .sort((a, b) => b.totalScore - a.totalScore);

    if (scoredSiblings[0]?.nameScore > 0) {
      const sibRfs = scoredSiblings[0].rfs;
      const intersection = matchedReqCodes.filter((code) => sibRfs.includes(code));
      return intersection.length ? intersection.slice(0, 2) : sibRfs.slice(0, 2);
    }
    if (matchedReqCodes.length) return matchedReqCodes.slice(0, 2);
    if (scoredSiblings.length) return scoredSiblings[0].rfs.slice(0, 1);
    return functionalReqs.length ? [functionalReqs[0].codigo || functionalReqs[0].id_requerimiento] : [];
  }

  _app(proyecto, views, imports, routes, first) {
    return `import React from 'react';\nimport{Link,Navigate,Route,Routes,useLocation}from'react-router-dom';\n${imports.join('\n')}\nexport default function App(){\n  const location = useLocation();\n  return <div className="app-shell"><header className="nav"><div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', overflow: 'hidden' }}><Link to="/" className="nav-brand"><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary)' }}></span>${this._escape(proyecto.nombre)}</Link><nav className="nav-links">${views.map((view) => `<Link key=${JSON.stringify(view.route)} to=${JSON.stringify(view.route)} className={'nav-link' + (location.pathname === ${JSON.stringify(view.route)} ? ' active' : '')}>${this._escape(view.name)}</Link>`).join('')}</nav></div></header><Routes>${routes.join('')}<Route path="*" element={<Navigate to=${JSON.stringify(first)} replace/>}/></Routes></div>;\n}\n`;
  }

  /** Con autenticación: solo ve el menú de lo que su rol puede consultar y siempre puede cerrar sesión. */
  _appWithAuth(proyecto, views, imports, routes) {
    return `import React, { useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './session';
import LoginScreen from './LoginScreen';
import UsersScreen from './UsersScreen';
${imports.join('\n')}

const views = ${JSON.stringify(views.map((view) => ({ route: view.route, name: view.name, operations: view.operations, modulo: view.modulo || 'General' })))};

export default function App() {
  const { user, loading, can, logout } = useSession();
  const location = useLocation();
  const [openModule, setOpenModule] = useState(null);

  if (loading) return <main className="screen"><p role="status">Cargando…</p></main>;
  if (!user) return <LoginScreen />;

  const visible = views
    .filter((view) => view.route !== '/usuarios' && view.id !== 'usuarios' && view.name?.toLowerCase() !== 'usuarios')
    .filter((view) => !view.operations.length || view.operations.some((operation) => can(operation, 'GET')));

  const modules = Array.from(new Set(visible.map((v) => v.modulo || 'General')));
  const home = visible[0]?.route || (user.administrador ? '/usuarios' : '/');

  return (
    <div className="app-shell" style={{ background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 1.75rem', background: '#0f172a', color: 'white', borderBottom: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link to={home} className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'white', textDecoration: 'none', fontWeight: '700', fontSize: '1.1rem' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#38bdf8' }}></span>
            ${this._escape(proyecto.nombre)}
          </Link>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {modules.map((mod) => {
              const screensInMod = visible.filter((v) => (v.modulo || 'General') === mod);
              const isActive = screensInMod.some((v) => v.route === location.pathname);
              return (
                <div key={mod} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setOpenModule(openModule === mod ? null : mod)}
                    style={{
                      padding: '0.4rem 0.85rem',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: isActive ? '600' : '500',
                      background: isActive ? '#1e293b' : 'transparent',
                      color: isActive ? '#38bdf8' : '#cbd5e1',
                      border: '1px solid ' + (isActive ? '#334155' : 'transparent'),
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <span>{mod}</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>▾</span>
                  </button>
                  {openModule === mod && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '0.35rem',
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                        zIndex: 50,
                        minWidth: '220px',
                        padding: '0.35rem'
                      }}
                    >
                      {screensInMod.map((s) => (
                        <Link
                          key={s.route}
                          to={s.route}
                          onClick={() => setOpenModule(null)}
                          style={{
                            display: 'block',
                            padding: '0.5rem 0.85rem',
                            fontSize: '0.82rem',
                            color: location.pathname === s.route ? '#0b57d0' : '#334155',
                            fontWeight: location.pathname === s.route ? '600' : '400',
                            textDecoration: 'none',
                            borderRadius: '4px',
                            background: location.pathname === s.route ? '#eff6ff' : 'transparent'
                          }}
                        >
                          {s.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {user.administrador && (
              <Link
                to="/usuarios"
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: location.pathname === '/usuarios' ? '600' : '500',
                  color: location.pathname === '/usuarios' ? '#38bdf8' : '#cbd5e1',
                  textDecoration: 'none'
                }}
              >
                Usuarios
              </Link>
            )}
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#94a3b8', background: '#1e293b', padding: '0.3rem 0.75rem', borderRadius: '9999px', border: '1px solid #334155' }}>
            {user.nombre || user.email} · <strong style={{ color: '#f1f5f9' }}>{user.nombre_rol}</strong>
          </span>
          <button
            type="button"
            className="button secondary"
            onClick={logout}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem', background: '#334155', color: 'white', border: 'none' }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        <Routes>
          ${routes.join('\n          ')}
          {user.administrador && <Route path="/usuarios" element={<UsersScreen />} />}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
    </div>
  );
}
`;
  }

  _mobile(name, auth = false) {
    return [
      { ruta: 'mobile/package.json', lenguaje: 'json', contenido: JSON.stringify({ name: `${slug(name)}-mobile`, version: '1.0.0', private: true, engines: { node: MobileRuntime.node }, main: 'node_modules/expo/AppEntry.js', scripts: { start: 'expo start', 'export:android': 'expo export --platform android' }, dependencies: { expo: MobileRuntime.expo, react: MobileRuntime.react, 'react-native': MobileRuntime.reactNative } }, null, 2) },
      { ruta: 'mobile/app.json', lenguaje: 'json', contenido: JSON.stringify({ expo: { name, slug: slug(name), version: '1.0.0', platforms: ['android', 'ios'] } }, null, 2) },
      { ruta: 'mobile/.env.example', lenguaje: 'dotenv', contenido: 'EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3000\n' },
      { ruta: 'mobile/App.js', lenguaje: 'javascript', contenido: renderTemplate(template('mobile-App.js'), { AUTH: String(auth), TITLE: JSON.stringify(name) }) }
    ];
  }

  _plainText(html) { return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  _escape(value) { return String(value || '').replace(/[<>&{}]/g, ''); }
}

module.exports = GenericFrontendGenerator;
