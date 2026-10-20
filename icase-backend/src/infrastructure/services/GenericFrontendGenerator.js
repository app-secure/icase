const fs = require('node:fs');
const path = require('node:path');

const renderTemplate = require('./renderTemplate');

const TEMPLATES = path.join(__dirname, '..', 'templates', 'frontend');
const template = (name) => fs.readFileSync(path.join(TEMPLATES, name), 'utf8');

const slug = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pantalla';
const component = (value) => slug(value).split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');

class GenericFrontendGenerator {
  generate({ proyecto, screens, decisiones = {}, sistemaDiseno = {} }) {
    const platforms = decisiones.alcance_plataforma?.plataformas || decisiones.stack_tecnologico?.plataformas || ['web'];
    const colors = sistemaDiseno.colores || {};
    const views = screens.map((screen) => this._view(screen));
    const acceso = decisiones.control_acceso || null;
    const auth = acceso?.autenticacion?.metodo === 'jwt';
    const openRoles = auth ? (acceso.roles || []).filter((role) => role.incluir !== false && role.autoregistro === true).map((role) => ({ id: role.id, nombre: role.nombre })) : [];
    const files = [
      { ruta: 'frontend/package.json', lenguaje: 'json', contenido: JSON.stringify({ name: `${slug(proyecto.nombre)}-frontend`, version: '1.0.0', private: true, type: 'module', scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build', preview: 'vite preview --host 0.0.0.0' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', 'react-router-dom': '^7.0.0' }, devDependencies: { '@vitejs/plugin-react': '^5.0.0', vite: '^7.0.0' } }, null, 2) },
      { ruta: 'frontend/vite.config.js', lenguaje: 'javascript', contenido: "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({plugins:[react()],server:{proxy:{'/api':'http://localhost:3000','/health':'http://localhost:3000'}}});\n" },
      { ruta: 'frontend/index.html', lenguaje: 'html', contenido: `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${this._escape(proyecto.nombre)}</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>` },
      { ruta: 'frontend/src/main.jsx', lenguaje: 'javascript', contenido: "import React from 'react';\nimport{createRoot}from'react-dom/client';\nimport{BrowserRouter}from'react-router-dom';\nimport { SessionProvider } from './session';\nimport App from './App';\nimport './styles.css';\ncreateRoot(document.getElementById('root')).render(<SessionProvider><BrowserRouter><App/></BrowserRouter></SessionProvider>);\n" },
      { ruta: 'frontend/src/OperationScreen.jsx', lenguaje: 'javascript', contenido: template('OperationScreen.jsx') },
      { ruta: 'frontend/src/session.jsx', lenguaje: 'javascript', contenido: template(auth ? 'session-auth.jsx' : 'session-open.jsx') },
      ...(auth ? [
        { ruta: 'frontend/src/LoginScreen.jsx', lenguaje: 'javascript', contenido: renderTemplate(template('LoginScreen.jsx'), { REGISTRO: JSON.stringify(openRoles) }) },
        { ruta: 'frontend/src/UsersScreen.jsx', lenguaje: 'javascript', contenido: template('UsersScreen.jsx') }
      ] : []),
      { ruta: 'frontend/src/styles.css', lenguaje: 'css', contenido: `:root{font-family:Inter,system-ui,sans-serif;color:${colors.texto || '#0f172a'};background:${colors.fondo || '#f8fafc'};--primary:${colors.primario || '#6d28d9'}}*{box-sizing:border-box}body{margin:0}.nav{display:flex;gap:1rem;flex-wrap:wrap;padding:1rem;background:white;border-bottom:1px solid #ddd}.screen{max-width:1050px;margin:auto;padding:2rem}.card{background:white;border:1px solid #dbe1ea;border-radius:12px;padding:1rem;margin:1rem 0}.field{width:100%;min-height:7rem;padding:.75rem;font:inherit}.button{border:0;border-radius:8px;padding:.65rem 1rem;margin:.25rem;background:var(--primary);color:white}.danger{background:#b91c1c}.tabs{display:flex;gap:.5rem;flex-wrap:wrap}.tabs button{background:#ede9fe;color:#4c1d95}.record{white-space:pre-wrap;background:#f8fafc;padding:.75rem;border-radius:8px}.error{color:#b91c1c}.success{color:#047857}` },
      { ruta: 'frontend/icase.manifest.json', lenguaje: 'json', contenido: JSON.stringify({ project: proyecto.nombre, mode: 'generic_contract_v1', plataformas_solicitadas: platforms, auth: { habilitada: auth, registro: openRoles }, pantallas: views }, null, 2) }
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
    files.push({ ruta: 'frontend/src/App.jsx', lenguaje: 'javascript', contenido: auth ? this._appWithAuth(proyecto, views, imports, routes) : this._app(proyecto, views, imports, routes, first) });
    if (platforms.some((item) => /m[oó]vil|android|ios|react native/i.test(item))) files.push(...this._mobile(proyecto.nombre, auth));
    return files;
  }

  _view(screen) {
    const rf = screen.rf_trazabilidad || screen.mockup?.rf_trazabilidad || [];
    const id = slug(screen.slug || screen.nombre || screen.nombre_pantalla);
    const route = String(screen.ruta || '').trim();
    return { id, name: screen.nombre || screen.nombre_visible || screen.nombre_pantalla || id, route: route.startsWith('/') ? route : `/${route || id}`, roles: screen.roles || [], requirements: rf, operations: rf.map(slug) };
  }

  _app(proyecto, views, imports, routes, first) {
    return `import React from 'react';\nimport{Link,Navigate,Route,Routes}from'react-router-dom';\n${imports.join('\n')}\nexport default function App(){return <><nav className="nav"><strong>${this._escape(proyecto.nombre)}</strong>${views.map((view) => `<Link to=${JSON.stringify(view.route)}>${this._escape(view.name)}</Link>`).join('')}</nav><Routes>${routes.join('')}<Route path="*" element={<Navigate to=${JSON.stringify(first)} replace/>}/></Routes></>}\n`;
  }

  /** Con autenticación: solo ve el menú de lo que su rol puede consultar y siempre puede cerrar sesión. */
  _appWithAuth(proyecto, views, imports, routes) {
    return `import React from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './session';
import LoginScreen from './LoginScreen';
import UsersScreen from './UsersScreen';
${imports.join('\n')}

const views = ${JSON.stringify(views.map((view) => ({ route: view.route, name: view.name, operations: view.operations })))};

export default function App() {
  const { user, loading, can, logout } = useSession();
  if (loading) return <main className="screen"><p role="status">Cargando…</p></main>;
  if (!user) return <LoginScreen />;
  const visible = views.filter((view) => !view.operations.length || view.operations.some((operation) => can(operation, 'GET')));
  const home = visible[0]?.route || (user.administrador ? '/usuarios' : '/');
  return <>
    <nav className="nav">
      <strong>${this._escape(proyecto.nombre)}</strong>
      {visible.map((view) => <Link key={view.route} to={view.route}>{view.name}</Link>)}
      {user.administrador && <Link to="/usuarios">Usuarios</Link>}
      <span>{user.nombre || user.email} · {user.nombre_rol}</span>
      <button className="button" onClick={logout}>Cerrar sesión</button>
    </nav>
    <Routes>
      ${routes.join('\n      ')}
      {user.administrador && <Route path="/usuarios" element={<UsersScreen />} />}
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  </>;
}
`;
  }

  _mobile(name, auth = false) {
    return [
      { ruta: 'mobile/package.json', lenguaje: 'json', contenido: JSON.stringify({ name: `${slug(name)}-mobile`, version: '1.0.0', private: true, main: 'node_modules/expo/AppEntry.js', scripts: { start: 'expo start', 'export:android': 'expo export --platform android' }, dependencies: { expo: '~57.0.0', react: '19.2.3', 'react-native': '0.86.0' } }, null, 2) },
      { ruta: 'mobile/app.json', lenguaje: 'json', contenido: JSON.stringify({ expo: { name, slug: slug(name), version: '1.0.0', platforms: ['android', 'ios'] } }, null, 2) },
      { ruta: 'mobile/.env.example', lenguaje: 'dotenv', contenido: 'EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3000\n' },
      { ruta: 'mobile/App.js', lenguaje: 'javascript', contenido: renderTemplate(template('mobile-App.js'), { AUTH: String(auth), TITLE: JSON.stringify(name) }) }
    ];
  }

  _plainText(html) { return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  _escape(value) { return String(value || '').replace(/[<>&{}]/g, ''); }
}

module.exports = GenericFrontendGenerator;
