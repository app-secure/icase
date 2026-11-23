const fs = require('node:fs');
const path = require('node:path');

const renderTemplate = require('./renderTemplate');
const ModuleService = require('../../core/services/ModuleService');
const MobileRuntime = require('../../core/constants/MobileRuntime');

const HtmlToJsxTransformer = require('./HtmlToJsxTransformer');
const MockupBindingValidator = require('./MockupBindingValidator');
const { isLoginRequirement } = require('./IdentityRequirements');
const MockupTraceabilityService = require('./MockupTraceabilityService');

const TEMPLATES = path.join(__dirname, '..', 'templates', 'frontend');
const template = (name) => fs.readFileSync(path.join(TEMPLATES, name), 'utf8');

const slug = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pantalla';
const component = (value) => slug(value).split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
const STOPWORDS = new Set(['vista', 'pantalla', 'panel', 'modulo', 'seccion', 'pagina', 'inicio', 'listado', 'detalle', 'gestion', 'registro', 'edicion', 'consulta', 'para', 'del', 'las', 'los', 'una', 'con', 'por']);
const tokensOf = (value) => slug(value).split('-').filter((w) => w.length >= 3 && !STOPWORDS.has(w));
// Pantalla que solo es el acceso («Inicio de sesión»): con sesión real la reemplaza el login de la aplicación.
const isLoginOnlyScreen = (screen) => /^(?:pantalla de )?(?:inicio de sesion|iniciar sesion|login|acceso al sistema|autenticacion)$/.test(String(screen?.nombre || screen?.nombre_visible || screen?.nombre_pantalla || screen?.slug || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/-/g, ' ').trim());
const isAuthScreen = (screen) => /inicio.*sesion|login|autentic/i.test(screen?.slug || screen?.nombre || screen?.nombre_visible || screen?.nombre_pantalla || screen?.ruta || '');
const PlatformPolicy = require('../../core/services/PlatformPolicy');
const platformOf = (screen) => PlatformPolicy.of(screen);

/**
 * Los roles que el mockup escribe en texto libre («Personal de Cocina») se llevan al id del rol de la matriz de accesos («cocinero»):
 * es el que trae la sesión, y una sola fuente evita pantallas que nadie puede abrir.
 */
const resolveRoles = (names, catalog) => {
  const stem = (word) => word.slice(0, 4);
  const words = (value) => slug(value).split('-').filter((word) => word.length >= 4 && !['personal', 'usuario', 'cliente-final'].includes(word));
  const resolved = (names || []).map((name) => {
    const key = slug(name);
    const exact = catalog.find((role) => role.id === key || slug(role.nombre) === key);
    if (exact) return exact.id;
    const near = catalog.find((role) => words(name).some((word) => [...words(role.id), ...words(role.nombre)].some((other) => stem(other) === stem(word))));
    return near ? near.id : key;
  });
  return [...new Set(resolved)];
};

// Estilos del módulo de formularios por campo y diseño moderno tipo Dashboard.
const TYPED_FORMS_CSS = '.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem}.form-row{display:flex;flex-direction:column;gap:.35rem}.input{width:100%;padding:.65rem .85rem;font:inherit;font-size:.9rem;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;transition:border-color .15s,box-shadow .15s;outline:none}.input:focus{border-color:var(--primary);background:white;box-shadow:0 0 0 3px rgba(99,102,241,.15)}.input[aria-invalid="true"]{border-color:#ef4444;background:#fef2f2}.field-error{color:#dc2626;font-size:.8rem;font-weight:500}.secondary{background:#f1f5f9!important;color:#334155!important;border:1px solid #cbd5e1!important}.secondary:hover{background:#e2e8f0!important}.table-wrap{overflow-x:auto;border-radius:10px;border:1px solid #e2e8f0;margin-top:.75rem}.records{width:100%;border-collapse:collapse;font-size:.875rem}.records th{background:#f8fafc;color:#475569;font-weight:600;text-transform:uppercase;font-size:.75rem;letter-spacing:.05em;padding:.75rem 1rem;border-bottom:1px solid #e2e8f0}.records td{padding:.85rem 1rem;border-bottom:1px solid #f1f5f9;color:#1e293b;vertical-align:middle}.records tr:last-child td{border-bottom:none}.records tr:hover{background:#f8fafc}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}';

class GenericFrontendGenerator {
  generate({ proyecto, screens, decisiones = {}, sistemaDiseno = {}, requerimientos = [], identidad = null, referencias = null, spec = null }) {
    const platforms = decisiones.stack_tecnologico?.plataformas || decisiones.alcance_plataforma?.plataformas || ['web'];
    const colors = sistemaDiseno.colores || {};
    const acceso = decisiones.control_acceso || null;
    const auth = acceso?.autenticacion?.metodo === 'jwt';
    // Identidad: los RF de acceso no son destino de datos y, con sesión real, su pantalla diseñada sobra (la aplicación trae su acceso).
    const identity = {
      login: [...new Set([...(identidad?.login || []), ...(requerimientos || []).filter(isLoginRequirement).map((item) => item.identificador)].filter(Boolean).map((id) => String(id).toUpperCase()))],
      usuarios: [...new Set((identidad?.usuarios || []).map((id) => String(id).toUpperCase()))]
    };
    const loginIds = new Set(identity.login);
    const allViews = screens.map((screen) => this._view(screen, screens, requerimientos))
      .filter((view, index) => !(auth && (
        (isAuthScreen(screens[index]) && (isLoginOnlyScreen(screens[index]) || view.requirements.every((id) => loginIds.has(String(id).toUpperCase()))))
        || (view.platform === 'web' && (view.route === '/usuarios' || view.id === 'usuarios'))
      )));
    const roleCatalog = [{ id: 'administrador', nombre: 'Administrador' }, ...((acceso?.roles || []).filter((role) => role.incluir !== false).map((role) => ({ id: slug(role.id), nombre: role.nombre || role.id })))];
    if (auth) for (const view of allViews) view.roles = resolveRoles(view.roles, roleCatalog);
    const views = allViews.filter((view) => view.platform === 'web');
    const explicitMobile = screens.some((screen) => platformOf(screen) === 'móvil');
    const mobileViews = allViews.filter((view) => view.platform === 'móvil' || (!explicitMobile && !view.platformDeclared));
    const selectedWeb = platforms.includes('web') || platforms.includes('tablet');
    const selectedMobile = platforms.some((item) => /m[oó]vil|android|ios|react native/i.test(item));
    // Sin aplicación móvil y con la opción activada en la planificación, las pantallas móviles (el flujo del cliente) también se sirven en la web.
    if (selectedWeb && !selectedMobile && decisiones.alcance_plataforma?.moviles_en_web === true) {
      for (const view of allViews.filter((item) => item.platform === 'móvil')) { view.adaptada = true; views.push(view); }
    }
    if (screens.some((screen) => screen.plataforma) && selectedWeb && !views.length) {
      throw new Error('No hay pantallas web en el árbol aprobado. Revisa las plataformas antes de generar.');
    }
    if (screens.some((screen) => screen.plataforma) && selectedMobile && !mobileViews.length) {
      throw new Error('No hay pantallas móviles en el árbol aprobado. Revisa las plataformas antes de generar.');
    }
    const usedRoutes = new Set();
    for (const view of views) {
      let candidate = view.route;
      for (let suffix = 2; usedRoutes.has(candidate); suffix += 1) candidate = `${view.route}-${suffix}`;
      view.route = candidate;
      usedRoutes.add(candidate);
    }
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
      { ruta: 'frontend/src/styles.css', lenguaje: 'css', contenido: `:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${colors.texto || '#0f172a'};background:#f1f5f9;--primary:${colors.primario || '#4f46e5'};--primary-hover:#4338ca}*{box-sizing:border-box}.mockup-screen{width:100%;max-width:none;margin:0;padding:0}.mockup-content>[class*="max-w-"]:not([class*="mx-auto"]){margin-left:auto;margin-right:auto}.mockup-content .grid:has(>:only-child){grid-template-columns:minmax(0,1fr)!important}.mockup-content .grid:has(>:only-child)>*{grid-column:auto!important}body{margin:0;background:#f1f5f9;color:#0f172a;line-height:1.5}.app-shell{min-height:100vh;display:flex;flex-direction:column}.app-layout{display:flex;flex:1;min-height:0}.app-nav{width:230px;flex-shrink:0;padding:12px;border-right:1px solid #e2e8f0;background:#fff;overflow:auto}.app-nav a{display:block;padding:10px;border-radius:8px;overflow-wrap:anywhere;color:inherit;text-decoration:none;font-size:.9rem}.app-nav a:hover{background:#f1f5f9}.app-nav a[aria-current]{background:var(--primary);color:#fff}.app-nav-group{margin:12px 0 4px;padding:0 10px;font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b}.app-main{flex:1;min-width:0;overflow:auto}@media (max-width:800px){.app-layout{flex-direction:column}.app-nav{width:100%;max-height:200px;border-right:0;border-bottom:1px solid #e2e8f0}}.nav{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;padding:.75rem 1.75rem;background:white;border-bottom:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,.04)}.nav-brand{font-size:1.15rem;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:.5rem;text-decoration:none}.nav-links{display:flex;align-items:center;gap:.5rem;overflow-x:auto;padding:.25rem 0}.nav-link{text-decoration:none;color:#475569;font-size:.875rem;font-weight:500;padding:.45rem .85rem;border-radius:6px;transition:all .15s;white-space:nowrap}.nav-link:hover{background:#f1f5f9;color:#0f172a}.nav-link.active{background:#ede9fe;color:#4f46e5;font-weight:600}.nav-user{display:flex;align-items:center;gap:1rem;font-size:.875rem;color:#475569}.user-badge{background:#f1f5f9;padding:.35rem .75rem;border-radius:9999px;font-weight:500;border:1px solid #e2e8f0}.screen{max-width:1200px;width:100%;margin:1.5rem auto;padding:0 1.5rem}.screen h1{font-size:1.65rem;font-weight:700;color:#0f172a;margin:0 0 1rem 0;letter-spacing:-.02em}.card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:1.5rem;margin:1.25rem 0;box-shadow:0 1px 3px rgba(0,0,0,.03)}.card h2{font-size:1.15rem;font-weight:600;margin:0 0 1rem 0;color:#1e293b}.field{width:100%;min-height:2.65rem;padding:.6rem .85rem;font:inherit;font-size:.9rem;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;outline:none;transition:border-color .15s}.field:focus{border-color:var(--primary);background:white}.button{border:0;border-radius:8px;padding:.55rem 1.15rem;font-size:.875rem;font-weight:500;cursor:pointer;background:var(--primary);color:white;transition:opacity .15s,transform .05s;display:inline-flex;align-items:center;gap:.5rem}.button:hover{opacity:.92}.button:active{transform:scale(.98)}.button:disabled{opacity:.5;cursor:not-allowed}.danger{background:#ef4444!important}.danger:hover{background:#dc2626!important}.tabs{display:flex;gap:.5rem;margin-bottom:1rem}.tabs button{background:#e2e8f0;color:#334155}.tabs button.active{background:var(--primary);color:white}.record{white-space:pre-wrap;background:#f8fafc;padding:1rem;border-radius:8px;border:1px solid #e2e8f0}.error{color:#dc2626;background:#fef2f2;border:1px solid #fecaca;padding:.75rem 1rem;border-radius:8px;font-size:.875rem}.success{color:#059669;background:#ecfdf5;border:1px solid #a7f3d0;padding:.75rem 1rem;border-radius:8px;font-size:.875rem}${typedForms ? TYPED_FORMS_CSS : ''}` },
      { ruta: 'frontend/icase.manifest.json', lenguaje: 'json', contenido: JSON.stringify({ project: proyecto.nombre, mode: 'generic_contract_v1', modulos: { formularios_tipados: typedForms }, plataformas_solicitadas: platforms, auth: { habilitada: auth, registro: openRoles }, identidad: identity, pantallas: views }, null, 2) }
    ];
    const imports = [];
    const routes = [];
    // Operaciones a las que un data-accion del mockup puede cablearse: los RF aprobados y los de las pantallas.
    const allowedOperations = new Set([
      ...(requerimientos || []).filter((req) => String(req.tipo || 'RF').toUpperCase() === 'RF' && req.identificador && req.aprobado !== false).map((req) => slug(req.identificador)),
      ...views.flatMap((view) => view.operations)
    ].filter((operation) => !loginIds.has(String(operation).toUpperCase())));
    const usersMap = Object.fromEntries(identity.usuarios.map((id) => [slug(id), 'usuarios']).filter(([key]) => allowedOperations.has(key)));
    let anyWired = false;
    let anyLive = false;
    let anyReferences = false;
    const specSummaries = new Map(); // pantallas construidas desde la especificación, para el manifiesto
    const routeSet = new Set(views.map((view) => view.route));
    const standalone = []; // rutas cuyo mockup trae su propio menú
    const tailwindConfigs = [];
    const linkSummaries = new Map(); // resumen de enlaces de cada pantalla con mockup, para el manifiesto
    for (const view of views) {
      if (auth && (view.route === '/usuarios' || view.id === 'usuarios' || view.name?.toLowerCase() === 'usuarios')) continue;
      const name = component(view.id);
      imports.push(`import ${name} from './pages/${view.id}';`);
      routes.push(`<Route path=${JSON.stringify(view.route)} element={<${name}/>}/>`);
      const screen = screens.find((item) => this._view(item, screens, requerimientos).id === view.id);
      // Una pantalla con componentes aprobados en la especificación se construye con ellos, no con el HTML del mockup.
      const specPage = this._specPage(view, name, spec);
      // El mockup aprobado es la interfaz de la pantalla; la especificación aporta las operaciones con las que sus botones guardan y consultan.
      // Solo si el mockup no se puede convertir a la interfaz, la pantalla se construye únicamente con los componentes de la especificación.
      const specFound = specPage ? this._specBlocks(view, spec) : null;
      // Operaciones cuyo listado real muestra esta pantalla: el resto se ofrece en «Registros» (ver App).
      view.lista = specFound
        ? specFound.blocks.filter((block) => ['tabla', 'tarjetas'].includes(block.tipo)).map((block) => specFound.actions[block.operacion]).filter((item) => item?.type === 'consulta').flatMap((item) => [item.permiso || item.capability, item.capability])
        : (screen?.mockup?.preview_code ? [] : view.operations);
      const mockupHtml = screen?.mockup?.preview_code;
      const mockupProbe = specPage && mockupHtml ? HtmlToJsxTransformer.analyze(mockupHtml, { operaciones: new Set(views.flatMap((item) => item.operations)), routes: routeSet, referencias: referencias || {} }) : null;
      if (specPage && !mockupProbe?.jsx) {
        files.push({ ruta: `frontend/src/pages/${view.id}.jsx`, lenguaje: 'javascript', contenido: specPage.contenido });
        if (mockupHtml) files.push({ ruta: `frontend/mockups-reference/${view.id}.html`, lenguaje: 'html', contenido: mockupHtml });
        specSummaries.set(view.id, specPage.resumen);
        continue;
      }
      if (specPage) specSummaries.set(view.id, { ...specPage.resumen, interfaz: 'mockup' });
      const reference = this._plainText(screen?.mockup?.preview_code || '').slice(0, 600);
      const mockupCode = screen?.mockup?.preview_code;
      const analysis = mockupCode ? HtmlToJsxTransformer.analyze(mockupCode, { operaciones: allowedOperations, routes: routeSet, referencias: referencias || {} }) : null;
      const jsxBody = analysis ? analysis.jsx : '';
      // Una pantalla de mockup sin vista en la especificación, pero que guarda una operación con líneas o lee datos, también se enlaza.
      const wired = jsxBody.includes('handleAction(');
      // «Listado de usuarios» con identidad: las cuentas viven en /api/users, no en una operación de la especificación. Sin esto la
      // tabla mostraba los usuarios de ejemplo del diseño y su «Buscar» no hacía nada.
      const cuentas = !specFound && auth && identity.usuarios.length && analysis && /^(?:pantalla de )?(?:listado|lista|gestion|administracion) de usuarios\b/.test(String(view.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())
        ? { blocks: [{ tipo: 'tabla', operacion: 'cuentasDeUsuario', campos: ['nombre', 'email', 'rol', 'activo'] }], actions: { cuentasDeUsuario: { name: 'cuentasDeUsuario', type: 'consulta', method: 'GET', path: '/api/users', capability: slug(identity.usuarios[0]), entity: 'usuario', filters: [], fields: { activo: { type: 'boolean' } }, inputs: [], output: ['nombre', 'email', 'rol', 'activo'] } } }
        : null;
      const live = specFound || cuentas || (wired && analysis && spec?.acciones?.length ? { blocks: [], actions: {} } : null);
      if (live && !specFound) anyLive = true;
      const specActionMap = live ? this._specActionMap(live.actions, spec) : null;
      anyWired = anyWired || wired;
      const usesLink = jsxBody.includes('<Link ');
      const usesReferences = jsxBody.includes('<ReferenceOptions');
      anyReferences = anyReferences || usesReferences;
      // El CSS propio del mockup se acota a su pantalla; los scripts nunca se copian.
      const css = analysis ? HtmlToJsxTransformer.scopeCss(analysis.css, `.mockup-${view.id}`) : '';
      if (analysis?.tailwindConfig) tailwindConfigs.push(analysis.tailwindConfig);
      if (jsxBody && analysis.hasShell) standalone.push(view.route);
      const bodyClass = analysis ? analysis.bodyClassName.replace(/[^\w\s:/.\-[\]%#,()!@=]/g, '').replace(/\s+/g, ' ').trim() : '';
      const bodyStyle = analysis && Object.keys(analysis.bodyStyle).length ? analysis.bodyStyle : null;
      if (css.trim()) files.push({ ruta: `frontend/src/pages/${view.id}.css`, lenguaje: 'css', contenido: `${css}\n` });
      if (analysis) {
        const check = new MockupBindingValidator().validar({ html: mockupCode, requerimientos, identidad: identity });
        const unlinked = check.advertencias.filter((item) => item.startsWith('sin enlace: ')).map((item) => item.slice('sin enlace: '.length));
        const count = (state) => check.enlaces.filter((item) => item.estado === state).length;
        linkSummaries.set(view.id, {
          validos: count('valido'), invalidos: count('invalido'), ui: count('ui'),
          sin_enlace: unlinked.slice(0, 10), sin_enlace_total: unlinked.length,
          cableados: (jsxBody.match(/handleAction\(/g) || []).length,
          acciones: check.enlaces.filter((item) => item.estado === 'valido' && allowedOperations.has(item.rf.toLowerCase()))
            .slice(0, 20).map((item) => ({ operacion: item.rf.toLowerCase(), verbo: item.verbo, control: item.control }))
        });
      }

      files.push({
        ruta: `frontend/src/pages/${view.id}.jsx`,
        lenguaje: 'javascript',
        contenido: `import React, { ${live ? 'useEffect, useRef, ' : ''}useState } from 'react';\nimport OperationScreen from '../OperationScreen';\n${usesLink ? "import { Link } from 'react-router-dom';\n" : ''}${usesReferences ? "import ReferenceOptions from '../ReferenceOptions';\n" : ''}${css.trim() ? `import './${view.id}.css';\n` : ''}${wired ? "import { useSession } from '../session';\nimport { runAction } from '../mockupActions';\nimport MockupResult from '../MockupResult';\n" : ''}${live && !wired ? "import { useSession } from '../session';\n" : ''}${live ? `import { SpecBlock } from '../SpecComponents';\nconst specActions = ${JSON.stringify(live.actions)};\nconst specBlocks = ${JSON.stringify(live.blocks)};\nconst specMap = ${JSON.stringify(specActionMap)};\nimport { bindLiveTables, bindLines, filterLive } from '../liveTables';\n` : ''}const referenceText=${JSON.stringify(reference)};\nexport default function ${name}(){\n  const [showCrud, setShowCrud] = useState(false);\n${live ? "  const mockupRef = useRef(null);\n  const [version, setVersion] = useState(0);\n  const { api: liveApi, can: liveCan } = useSession();\n  useEffect(() => { if (!showCrud && mockupRef.current) bindLines({ root: mockupRef.current, specMap, api: liveApi }); bindLiveTables({ root: mockupRef.current, blocks: specBlocks, actions: specActions, api: liveApi, can: liveCan, onAction: " + (wired ? 'handleAction' : 'undefined') + ", onShowOperations: () => setShowCrud(true) }); }, [showCrud, version, liveApi]);\n" : ''}${wired ? "  const [result, setResult] = useState(null);\n  const [selected, setSelected] = useState(null);\n  const { api, can } = useSession();\n  const handleAction = (event, operation, verb) => runAction({ event, operation, verb, api, can, selected, onSelect: setSelected, onResult: " + (live ? "(next) => { setResult(next); if (next && next.estado === 'ok' && !next.registros) setVersion((n) => n + 1); }" : 'setResult') + (live ? ', acciones: specMap, filtrar: (fields) => filterLive(mockupRef.current, fields)' : '') + (Object.keys(usersMap).length ? `, identidad: ${JSON.stringify(usersMap)}` : '') + " });\n" : ''}  return (\n    <main ${jsxBody ? "className={showCrud ? 'page-container screen' : 'mockup-screen'}" : 'className="page-container screen"'} data-screen=${JSON.stringify(view.id)}>\n      ${jsxBody ? `{!showCrud ? (\n        <div className="mockup-view-wrapper" style={{ minHeight: 'calc(100vh - 120px)'${analysis.hasShell ? '' : ", padding: '20px'"} }}>\n          <div ${live ? 'ref={mockupRef} ' : ''}className="mockup-content mockup-${view.id}${bodyClass ? ` ${bodyClass}` : ''}"${bodyStyle ? ` style={${JSON.stringify(bodyStyle)}}` : ''}>${wired ? `<MockupResult result={result} selected={selected} onSelect={setSelected} onClose={() => setResult(null)} selectable={${/data-accion="RF-\d+\.(editar|eliminar)"/i.test(mockupCode || '')}} />` : ''}${jsxBody}</div>\n        </div>\n      ) : (\n        <>\n        <div style={{ padding: '0.75rem 1.5rem' }}><button type="button" className="button secondary" onClick={() => setShowCrud(false)}>← Volver a la pantalla</button></div>\n        ${specFound ? '<div className="spec-page">{specBlocks.map((block, index) => <SpecBlock key={index} block={block} actions={specActions} />)}</div>' : `<OperationScreen title=${JSON.stringify(view.name)} capabilities={${JSON.stringify(view.operations)}} referenceText={referenceText} asChild />`}\n        </>\n      )}` : `<OperationScreen title=${JSON.stringify(view.name)} capabilities={${JSON.stringify(view.operations)}} referenceText={referenceText} asChild />`}\n    </main>\n  );\n}\n`
      });
      if (screen?.mockup?.preview_code) files.push({ ruta: `frontend/mockups-reference/${view.id}.html`, lenguaje: 'html', contenido: screen.mockup.preview_code });
    }
    if (anyWired || specSummaries.size || anyLive) {
      files.push(
        { ruta: 'frontend/src/mockupActions.js', lenguaje: 'javascript', contenido: template('mockup-actions.js') },
        { ruta: 'frontend/src/MockupResult.jsx', lenguaje: 'javascript', contenido: template('MockupResult.jsx') },
        { ruta: 'frontend/src/uiControls.js', lenguaje: 'javascript', contenido: template('ui-controls.js') },
        { ruta: 'frontend/src/dashboard.js', lenguaje: 'javascript', contenido: template('dashboard.js') }
      );
    }
    const uiControls = Boolean(anyWired || specSummaries.size || anyLive);
    if (specSummaries.size || anyLive) {
      anyReferences = true;
      files.push(
        { ruta: 'frontend/src/SpecComponents.jsx', lenguaje: 'javascript', contenido: `import './spec.css';\n${template('SpecComponents.jsx')}` },
        { ruta: 'frontend/src/spec.css', lenguaje: 'css', contenido: template('spec.css') },
        { ruta: 'frontend/src/liveTables.js', lenguaje: 'javascript', contenido: template('live-tables.js') }
      );
    }
    if (anyReferences) files.push({ ruta: 'frontend/src/ReferenceOptions.jsx', lenguaje: 'javascript', contenido: template('ReferenceOptions.jsx') });
    if (specSummaries.size) {
      const manifestFile = files.find((file) => file.ruta === 'frontend/icase.manifest.json');
      const manifest = JSON.parse(manifestFile.contenido);
      manifest.pantallas = manifest.pantallas.map((screen) => (specSummaries.has(screen.id) ? { ...screen, origen: 'especificacion', especificacion: specSummaries.get(screen.id) } : screen));
      manifestFile.contenido = JSON.stringify(manifest, null, 2);
    }
    if (linkSummaries.size) {
      const manifestFile = files.find((file) => file.ruta === 'frontend/icase.manifest.json');
      const manifest = JSON.parse(manifestFile.contenido);
      manifest.pantallas = manifest.pantallas.map((screen) => (linkSummaries.has(screen.id) ? { ...screen, enlaces: linkSummaries.get(screen.id) } : screen));
      manifestFile.contenido = JSON.stringify(manifest, null, 2);
    }
    const tailwind = this._tailwindConfig(tailwindConfigs, colors);
    if (tailwind) {
      const index = files.find((file) => file.ruta === 'frontend/index.html');
      index.contenido = index.contenido.replace('<script src="https://cdn.tailwindcss.com"></script>', (cdn) => `${cdn}<script>tailwind.config = ${tailwind};</script>`);
    }
    // Consola de datos del administrador: una entrada por operación con su editor genérico (y los módulos de adjuntos, reportes y cambios).
    const reqName = new Map((requerimientos || []).map((req) => [slug(req.identificador), req.nombre]));
    // Entidad de cada operación (según la especificación) para no repetir en el menú lo que ya lista una pantalla y nombrar el registro por su dato.
    const specActions = Array.isArray(spec?.acciones) ? spec.acciones : [];
    const entityOfOp = (key) => specActions.find((action) => action.capability === key && action.entity)?.entity || null;
    const lineOps = new Set(specActions.map((action) => action.lineas?.capability).filter(Boolean));
    const lineEntities = new Set(specActions.map((action) => action.lineas?.entidadClave).filter(Boolean));
    const humanize = (key, name) => { const [first, ...rest] = String(name || key).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(' '); const plural = /[aeiou]$/.test(first) ? first + 's' : first.replace(/z$/, 'c') + 'es'; const text = [plural, ...rest].join(' '); return text.charAt(0).toUpperCase() + text.slice(1); };
    const entityName = (key) => specActions.find((action) => action.entity === key && action.entityName)?.entityName || null;
    const consoleOps = auth ? [...allowedOperations].filter((key) => !loginIds.has(String(key).toUpperCase())).map((key) => { const entity = entityOfOp(key); return { key, name: `${String(key).toUpperCase()} · ${reqName.get(key) || key}`, label: reqName.get(key) || String(key).toUpperCase(), ...(entity ? { entity, menuLabel: humanize(entity, entityName(entity)) } : {}), ...(lineOps.has(key) || (entity && lineEntities.has(entity)) ? { linea: true } : {}) }; }) : [];
    if (consoleOps.length) files.push({ ruta: 'frontend/src/RegistryScreen.jsx', lenguaje: 'javascript', contenido: renderTemplate(template('RegistryScreen.jsx'), { OPERACIONES: JSON.stringify(consoleOps.map(({ key, label }) => ({ key, label }))) }) });
    if (consoleOps.length) files.push({ ruta: 'frontend/src/DataConsole.jsx', lenguaje: 'javascript', contenido: renderTemplate(template('DataConsole.jsx'), { OPERACIONES: JSON.stringify(consoleOps) }) });
    const first = views[0]?.route || '/';
    files.push({ ruta: 'frontend/src/App.jsx', lenguaje: 'javascript', contenido: auth ? this._appWithAuth(proyecto, views, imports, routes, standalone, consoleOps, uiControls) : this._app(proyecto, views, imports, routes, first, standalone) });
    if (platforms.some((item) => /m[oó]vil|android|ios|react native/i.test(item))) files.push(...this._mobile(proyecto.nombre, auth, mobileViews, spec));
    if(new ModuleService().activos(decisiones.modulos).includes('procesos_negocio')){
      if(!auth)throw new Error('La bandeja de procesos requiere JWT');
      if(views.some(view=>view.route==='/procesos'))throw new Error('La ruta /procesos está reservada para la bandeja de procesos');
      files.push({ruta:'frontend/src/ProcessScreen.jsx',lenguaje:'javascript',contenido:template('ProcessScreen.jsx')});
      const app=files.find(file=>file.ruta==='frontend/src/App.jsx');
      app.contenido="import ProcessScreen from './ProcessScreen';\n"+app.contenido;
      const userBadge=/<span\b[^>\n]*>\s*\{user\.nombre/;
      if(!userBadge.test(app.contenido))throw new Error('No se encontró dónde insertar el enlace a procesos en la cabecera');
      app.contenido=app.contenido.replace('<Routes>','<Routes><Route path="/procesos" element={<ProcessScreen/>}/>')
        .replace(userBadge,match=>'<Link to="/procesos" className="nav-link" style={{ color: \'#cbd5e1\', textDecoration: \'none\', fontSize: \'0.9rem\' }}>Procesos</Link>'+match);
      const mobileApp=files.find(file=>file.ruta==='mobile/App.js');
      if(mobileApp){
        files.push({ruta:'mobile/ProcessScreen.js',lenguaje:'javascript',contenido:template('mobile-ProcessScreen.js')});
        mobileApp.contenido="import ProcessScreen from './ProcessScreen';\n"+mobileApp.contenido
          .replace("const [error, setError] = useState('');","const [error, setError] = useState('');\n  const [processScreen, setProcessScreen] = useState(false);")
          .replace('const clearBusinessState = () => { setScreen(null); setOperation(null); setRecords([]); };', 'const clearBusinessState = () => { setScreen(null); setOperation(null); setRecords([]); setProcessScreen(false); };')
          .replace('{AUTH && <Button title="Cerrar sesión" onPress={() => { setToken(null); setPermisos(null); clearBusinessState(); }} />}','{AUTH && <Button title="Procesos" onPress={() => setProcessScreen((value) => !value)} />}\n    {processScreen ? <ProcessScreen api={call} token={token} /> : null}\n    {AUTH && <Button title="Cerrar sesión" onPress={() => { setToken(null); setPermisos(null); clearBusinessState(); }} />}');
      }
    }
    const extended = new (require('./SpecializedFrontendGenerator'))().apply(new (require('./ExtendedFrontendGenerator'))().apply(files,{decisiones}),{decisiones});
    const generated = new ModuleService().activos(decisiones.modulos).includes('eventos_cambios')
      ? new (require('./ChangeEventsClientGenerator'))().apply(extended, { auth }) : extended;
    if (decisiones.stack_tecnologico?.estilos === 'Estilos del mockup' && !tailwind) {
      const index = generated.find(file => file.ruta === 'frontend/index.html');
      index.contenido = index.contenido.replace('<script src="https://cdn.tailwindcss.com"></script>', '');
    }
    return generated.filter(file => file.ruta.startsWith('mobile/') || platforms.includes('web') || platforms.includes('tablet'));
  }

  /**
   * Página de una pantalla descrita por la especificación aprobada: una lista de bloques (tabla, tarjetas, formulario,
   * detalle, indicador) y las operaciones que usan. Devuelve null si la pantalla no tiene componentes resolubles.
   */
  _specBlocks(view, spec) {
    const screen = (spec?.pantallas || []).find((item) => item.id === view.id);
    if (!screen) return null;
    const byName = new Map((spec.acciones || []).map((action) => [action.name, action]));
    const blocks = screen.componentes
      .filter((component) => byName.has(component.operacion))
      .map((component) => ({ ...component, acciones: (component.acciones || []).filter((action) => byName.has(action.operacion)) }));
    if (!blocks.length) return null;
    const used = new Set(blocks.flatMap((block) => [block.operacion, ...block.acciones.map((action) => action.operacion)]));
    const actions = Object.fromEntries([...used].map((operation) => {
      const action = byName.get(operation);
      return [operation, { name: action.name, type: action.type, method: action.method, path: action.path, byId: action.byId, capability: action.capability, ...(action.permission && action.permission !== action.capability ? { permiso: action.permission } : {}), entity: action.entity, filters: action.filters, fields: action.fields, inputs: action.inputs, output: action.output, ...(action.relacionadas?.length ? { relacionadas: action.relacionadas.map((rel) => ({ clave: rel.clave, items: Boolean(rel.items) })) } : {}), ...(action.lineas?.capability ? { lineas: { referencia: action.lineas.referencia, cantidad: action.lineas.cantidad, destino: action.lineas.destino, precio: action.lineas.precio?.desde || null, ...(action.lineas.stock ? { stock: action.lineas.stock } : {}) } } : {}), ...(action.vincula ? { vincula: action.vincula } : {}), ...(action.anula ? { anula: action.anula } : {}) }];
    }));
    return { blocks, actions, used };
  }

  /** `rf-15.crear` → la operación de la especificación que guarda: un botón del mockup llama a la operación con nombre y no a un CRUD genérico. */
  _specActionMap(screenActions, spec) {
    const verb = { consulta: 'consultar', resumen: 'consultar', crear: 'crear', actualizar: 'editar', transicion: 'editar', eliminar: 'eliminar' };
    const map = {};
    const add = (action) => {
      const key = `${String(action.permiso || action.permission || action.capability).toLowerCase()}.${verb[action.type]}`; // el botón del mockup dice «RF-06.editar»: el requisito, no el almacén
      if (verb[action.type] && !map[key]) map[key] = { name: action.name, method: action.method, path: action.path, byId: Boolean(action.byId), inputs: [...(action.inputs || []), ...(action.vincula?.parametro && !(action.inputs || []).includes(action.vincula.parametro) ? [action.vincula.parametro] : [])], ...(action.vincula ? { vincula: { parametro: action.vincula.parametro, entidad: action.vincula.entidad, campo: action.vincula.campo, capability: action.vincula.capability } } : {}), ...(action.anula ? { anula: { estado: action.anula.estado, valor: action.anula.valor } } : {}), ...(action.lineas ? { lineas: { referencia: action.lineas.referencia, cantidad: action.lineas.cantidad, ...((typeof action.lineas.precio === 'string' ? action.lineas.precio : action.lineas.precio?.desde) ? { precio: typeof action.lineas.precio === 'string' ? action.lineas.precio : action.lineas.precio.desde } : {}), ...(action.lineas.stock ? { stock: action.lineas.stock } : {}) } } : {}), booleanos: (action.inputs || []).filter((name) => action.fields?.[name]?.type === 'boolean'), ...((action.filters || []).some((filter) => filter.origen === 'parametro') ? { parametros: action.filters.filter((filter) => filter.origen === 'parametro').map((filter) => String(filter.valor)) } : {}) };
    };
    Object.values(screenActions || {}).forEach(add);
    (spec?.acciones || []).forEach(add);
    // «Cancelar venta» enlazado como eliminar: si el requisito anula (registra la anulación, repone stock y anula la factura), el botón
    // llama a esa operación y no al borrado genérico.
    for (const [key, entry] of Object.entries(map)) {
      const del = key.replace(/.crear$/, '.eliminar');
      if (entry.anula && del !== key && !map[del]) map[del] = entry;
    }
    return map;
  }

  _specPage(view, name, spec) {
    const found = this._specBlocks(view, spec);
    if (!found) return null;
    const { blocks, actions, used } = found;
    const contenido = `import React from 'react';\nimport { SpecBlock } from '../SpecComponents';\n\nconst actions = ${JSON.stringify(actions, null, 2)};\nconst blocks = ${JSON.stringify(blocks, null, 2)};\n\nexport default function ${name}() {\n  return (\n    <main className="spec-page" data-screen=${JSON.stringify(view.id)}>\n      <h1>{${JSON.stringify(view.name)}}</h1>\n      {blocks.map((block, index) => <SpecBlock key={index} block={block} actions={actions} />)}\n    </main>\n  );\n}\n`;
    return { contenido, resumen: { componentes: blocks.length, operaciones: [...used], bloques: blocks.map((block) => ({ tipo: block.tipo, operacion: block.operacion })) } };
  }

  _view(screen, screens = [], requerimientos = []) {
    const directRf = screen.rf_trazabilidad || screen.mockup?.rf_trazabilidad || [];
    const rf = directRf.length ? directRf : this._inferScreenRfs(screen, screens, requerimientos);
    const id = slug(screen.slug || screen.nombre || screen.nombre_pantalla);
    const route = String(screen.ruta || '').trim();
    // El menú agrupa por flujo de usuario (Cliente, Mesero...); si el mockup no lo trae, por su módulo. Evita un grupo por pantalla.
    const modulo = screen.flujo || screen.mockup?.flujo || screen.modulo || screen.mockup?.modulo || 'General';
    // La ruta del árbol de navegación ("Sistema / Flujo / Pantalla") agrupa el menú, pero no es una URL: se usa una corta.
    const simple = /^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?$/i.test(route);
    return { id, name: screen.nombre || screen.nombre_visible || screen.nombre_pantalla || id, route: simple ? route : `/${id}`, roles: screen.roles || [], requirements: rf, operations: rf.map(slug), modulo, platform: platformOf(screen), platformDeclared: PlatformPolicy.declared(screen) !== null || platformOf(screen) === 'móvil' };
  }

  _inferScreenRfs(screen, screens = [], requerimientos = []) {
    if (!screen || isAuthScreen(screen)) return [];
    // Primero la evidencia semántica del propio mockup (con sinónimos): no depende de que la trazabilidad guardada esté al día.
    const evidencia = screen.mockup?.preview_code ? new MockupTraceabilityService().enrichMockup(screen.mockup, screen, requerimientos) : [];
    if (evidencia.length) return evidencia.slice(0, 4);
    const screenTokens = tokensOf(screen.nombre || screen.nombre_visible || screen.nombre_pantalla || screen.slug || '');
    const siblings = (screens || []).filter((item) => item !== screen && (item.rf_trazabilidad || item.mockup?.rf_trazabilidad || []).length > 0);
    const codeOf = (req) => req.identificador || req.codigo || req.id_requerimiento;
    const functionalReqs = (requerimientos || []).filter((req) => !['RNF', 'no_funcional'].includes(req.tipo) && codeOf(req));
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
        return { code: codeOf(req), score: titleScore + descScore };
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
    // Sin coincidencia por significado la asociación queda pendiente: heredar el RF de otra pantalla sería inventarla.
    return matchedReqCodes.slice(0, 2);
  }

  /**
   * Configuración de Tailwind para `index.html`: la de los mockups (leída como datos, el primero prevalece) o, si ninguno
   * la trae, la derivada del sistema de diseño. Sin ninguna de las dos no se añade nada.
   */
  _tailwindConfig(configs, colors = {}) {
    const merge = (base, extra) => {
      const out = { ...base };
      for (const [key, value] of Object.entries(extra)) {
        out[key] = value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key]) ? merge(out[key], value) : value;
      }
      return out;
    };
    let merged = configs.length ? [...configs].reverse().reduce((acc, config) => merge(acc, config), {}) : null;
    if (!merged && colors.primario) {
      merged = { theme: { extend: { colors: {
        primary: { 500: colors.primario, 600: colors.primario_oscuro || colors.primario, 700: colors.primario_oscuro || colors.primario },
        secondary: { 500: colors.secundario || '#64748b', 600: '#475569' }
      } } } };
    }
    return merged ? JSON.stringify(merged).replace(/</g, '\\u003c') : '';
  }

  _app(proyecto, views, imports, routes, first, standalone = []) {
    return `import React from 'react';\nimport{Link,Navigate,Route,Routes,useLocation}from'react-router-dom';\n${imports.join('\n')}\nexport default function App(){\n  const location = useLocation();\n  const standalone = ${JSON.stringify(standalone)};\n  return <div className="app-shell"><header className="nav"><div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', overflow: 'hidden' }}><Link to="/" className="nav-brand"><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary)' }}></span>${this._escape(proyecto.nombre)}</Link><nav className="nav-links" style={standalone.includes(location.pathname) ? { display: 'none' } : undefined}>${views.map((view) => `<Link key=${JSON.stringify(view.route)} to=${JSON.stringify(view.route)} className={'nav-link' + (location.pathname === ${JSON.stringify(view.route)} ? ' active' : '')}>${this._escape(view.name)}</Link>`).join('')}</nav></div></header><Routes>${routes.join('')}<Route path="*" element={<Navigate to=${JSON.stringify(first)} replace/>}/></Routes></div>;\n}\n`;
  }

  /** Con autenticación: solo ve el menú de lo que su rol puede consultar y siempre puede cerrar sesión. */
  _appWithAuth(proyecto, views, imports, routes, standalone = [], consoleOps = [], uiControls = false) {
    return `import React, { useState${uiControls ? ', useEffect' : ''} } from 'react';
import { Link, Navigate, Route, Routes, useLocation${uiControls ? ', useNavigate' : ''} } from 'react-router-dom';
import { useSession } from './session';${uiControls ? "\nimport { handleUiClick, handleRowClick, hydrateRecord, pruneDeadControls } from './uiControls';\nimport { bindDashboard } from './dashboard';" : ''}
import LoginScreen from './LoginScreen';
import UsersScreen from './UsersScreen';
${consoleOps.length ? "import DataConsole from './DataConsole';\nimport RegistryScreen from './RegistryScreen';" : ''}
${imports.join('\n')}

const views = ${JSON.stringify(views.map((view) => ({ route: view.route, name: view.name, operations: view.operations, roles: view.roles, modulo: view.modulo || 'General', lista: view.lista || [], ...(/^(?:pantalla de |formulario de )?(?:detalle|edicion|editar|modificar)/.test(slug(view.name).replace(/-/g, ' ')) ? { menu: false } : {}) })))};
const registryOperations = ${JSON.stringify(consoleOps.map(({ key, label, entity, linea, menuLabel }) => ({ key, label: menuLabel || label, ...(entity ? { entity } : {}), ...(linea ? { linea } : {}) })))};
const entityOf = ${JSON.stringify(Object.fromEntries(consoleOps.filter((op) => op.entity).map((op) => [op.key, op.entity])))};
const normalizarRol = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const puedeAbrirPantalla = (view, user, can) => {
  const roles = view.roles || [];
  const rolPermitido = !roles.length || roles.some((rol) => ['usuario', normalizarRol(user.rol)].includes(normalizarRol(rol)));
  // Como kindOf (uiControls.js): el alta exige poder crear y la edición poder modificar; el resto, poder consultar.
  const nombre = normalizarRol(view.name);
  const metodo = /^(?:formulario-de-)?(?:edicion|editar|modificar|modificacion)(?:-|$)/.test(nombre) ? 'PATCH'
    : /^(?:formulario-de-)?(?:registro|creacion|alta|nuevo|nueva|registrar|crear)(?:-|$)/.test(nombre) ? 'POST' : 'GET';
  // Un formulario de alta o edición se juzga por las operaciones de SU dato («producto»), no por toda la trazabilidad de la pantalla,
  // que suele ser ruidosa (la de crear producto trae también la de registrar ventas, que el vendedor sí puede).
  const dato = metodo === 'GET' ? '' : nombre.replace(/^(?:formulario-de-)?(?:edicion|editar|modificar|modificacion|registro|creacion|alta|nuevo|nueva|registrar|crear)-(?:de-)?/, '').split('-')[0].replace(/([lrndzj])es$/, '$1').replace(/s$/, '');
  const propias = dato ? view.operations.filter((operation) => String(entityOf[operation] || '').startsWith(dato)) : [];
  const evaluadas = propias.length ? propias : view.operations;
  return rolPermitido && (!view.operations.length || evaluadas.some((operation) => can(operation, metodo)));
};
// Pantalla diseñada que lista los usuarios: sustituye en el menú al enlace genérico «Usuarios» (su ruta se conserva).
const esListadoUsuarios = (view) => /^(?:pantalla-de-)?(?:listado|lista|catalogo|gestion)-(?:de-)?usuarios(?:-|$)/.test(normalizarRol(view.name));

export default function App() {
  const { user, loading, can, logout${uiControls ? ', api' : ''} } = useSession();
  const location = useLocation();${uiControls ? `
  const navigate = useNavigate();
  // Volver, Cancelar, Nuevo, Editar, Ver y Limpiar del diseño: navegan a la pantalla que corresponde (ver uiControls.js).
  useEffect(() => {
    const context = { views, current: location.pathname, search: location.search, navigate };
    const onClick = (event) => handleUiClick(event, context);
    const onRow = (event) => handleRowClick(event, context);
    document.addEventListener('click', onClick);
    document.addEventListener('click', onRow, true);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('click', onRow, true); };
  }, [location.pathname, location.search, navigate]);
  // Los «Nuevo» sin formulario de alta al que ir se ocultan al abrir la pantalla (esperan a que el contenido del diseño esté montado).
  useEffect(() => {
    if (!user) return undefined;
    const timers = [200, 900].map((delay) => setTimeout(() => pruneDeadControls(document.querySelector('.app-main .mockup-content'), { views, current: location.pathname, search: location.search }), delay));
    return () => timers.forEach(clearTimeout);
  }, [location.pathname, location.search, user]);
  // Detalle o edición abierta con ?id=: se carga ese registro (las opciones de los selects llegan después, por eso dos intentos).
  useEffect(() => {
    if (!user || !location.search) return undefined;
    const timers = [300, 1200].map((delay) => setTimeout(() => hydrateRecord(document.querySelector('.app-main .mockup-content'), { api, views, current: location.pathname, search: location.search, registries: registryOperations }), delay));
    return () => timers.forEach(clearTimeout);
  }, [location.pathname, location.search, user, api]);
  // Tablero del diseño: sus cifras y su tabla de recientes salen de los registros reales (ver dashboard.js).
  useEffect(() => {
    const view = views.find((item) => item.route === location.pathname);
    if (!user || !view || !/^(?:dashboard|tablero|panel|inicio|resumen general)/i.test(String(view.name).normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''))) return undefined;
    const timer = setTimeout(() => bindDashboard(document.querySelector('.app-main .mockup-content'), { api, can, registries: registryOperations }), 300);
    return () => clearTimeout(timer);
  }, [location.pathname, user, api]);` : ''}
  const standalone = ${JSON.stringify(standalone)};

  if (loading) return <main className="screen"><p role="status">Cargando…</p></main>;
  if (!user) return <LoginScreen />;

  const visible = views
    .filter((view) => view.route !== '/usuarios' && view.id !== 'usuarios' && view.name?.toLowerCase() !== 'usuarios')
    .filter((view) => puedeAbrirPantalla(view, user, can));

  const modules = Array.from(new Set(visible.filter((v) => v.menu !== false).map((v) => v.modulo || 'General')));
  // Lo que el rol puede consultar y ninguna de sus pantallas lista (la tabla de registros que el árbol de navegación no trajo).
  const listed = new Set(visible.flatMap((v) => v.lista || []));
  const listedEntities = new Set([...listed].map((key) => entityOf[key]).filter(Boolean));
  // Una entidad ya listada en una pantalla (las ventas) o que son las líneas de otra (el detalle de una venta) no se repite en «Registros».
  const registries = user.administrador ? [] : registryOperations.filter((op, index, all) => can(op.key, 'GET') && !listed.has(op.key) && !op.linea
    && !(op.entity && listedEntities.has(op.entity)) && !(op.entity && all.slice(0, index).some((other) => other.entity === op.entity && can(other.key, 'GET'))));
  const menu = visible.filter((v) => v.menu !== false);
  const usuariosDisenados = menu.some(esListadoUsuarios);
  const home = menu[0]?.route || (registries[0] ? '/registros/' + registries[0].key : (user.administrador ? '/usuarios' : '/sin-acceso'));

  // El menú nombra la pantalla como el diseño: sin el «Pantalla de» con que el árbol de navegación la titula.
  const navName = (name) => { const clean = String(name || '').replace(/^pantalla\\s+(?:de\\s+la\\s+|del?\\s+)?/i, ''); return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : name; };
  const linkProps = (path) => ({ 'aria-current': location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/')) ? 'page' : undefined });

  return (
    <div className="app-shell" style={{ background: '#f8fafc', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header className="nav" style={{ flexShrink: 0 }}>
        <Link to={home} className="nav-brand">${this._escape(proyecto.nombre)}</Link>
        <div className="nav-user">
          <span className="user-badge">{user.nombre || user.email} · <strong>{user.nombre_rol}</strong></span>
          <button type="button" className="button secondary" onClick={logout} style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem', background: '#e2e8f0', color: '#0f172a' }}>Cerrar sesión</button>
        </div>
      </header>

      <div className="app-layout">
        {!standalone.includes(location.pathname) && (
          <nav className="app-nav" aria-label="Pantallas de la aplicación">
            {modules.map((mod) => (
              <div key={mod}>
                {modules.length > 1 && <p className="app-nav-group">{mod}</p>}
                {menu.filter((v) => (v.modulo || 'General') === mod).map((s) => <Link key={s.route} to={s.route} {...linkProps(s.route)}>{navName(s.name)}</Link>)}
              </div>
            ))}
            {registries.length > 0 && (
              <div>
                <p className="app-nav-group">Registros</p>
                {registries.map((op) => <Link key={op.key} to={'/registros/' + op.key} {...linkProps('/registros/' + op.key)}>{op.label}</Link>)}
              </div>
            )}
            {user.administrador && (
              <div>
                <p className="app-nav-group">Administración</p>
                {!usuariosDisenados && <Link to="/usuarios" {...linkProps('/usuarios')}>Usuarios</Link>}
                ${consoleOps.length ? "<Link to=\"/datos\" {...linkProps('/datos')}>Datos</Link>" : ''}
              </div>
            )}
          </nav>
        )}

        <main className="app-main">
        <Routes>
          ${views.map((view, index) => `<Route path=${JSON.stringify(view.route)} element={visible.some((item) => item.route === ${JSON.stringify(view.route)}) ? <${component(view.id)}/> : <Navigate to={home} replace />}/>`).join('\n          ')}
          {user.administrador && <Route path="/usuarios" element={<UsersScreen />} />}
          ${consoleOps.length ? `<Route path="/registros/:key" element={<RegistryScreen />} />
          {user.administrador && <Route path="/datos" element={<DataConsole />} />}
          {user.administrador && <Route path="/datos/:key" element={<DataConsole />} />}` : ''}
          <Route path="/sin-acceso" element={<section className="screen" role="status"><h1>Sin pantallas disponibles</h1><p>Tu rol no tiene acceso a ninguna pantalla de esta aplicación. Solicita los permisos necesarios al administrador.</p></section>} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
        </main>
      </div>
    </div>
  );
}
`;
  }

  _mobile(name, auth = false, views = [], spec = null) {
    const screens = views.map((view) => {
      const found = this._specBlocks(view, spec);
      return { id: view.id, name: view.name, roles: view.roles, operations: view.operations, ...(found ? { blocks: found.blocks, actions: found.actions } : {}) };
    });
    return [
      { ruta: 'mobile/package.json', lenguaje: 'json', contenido: JSON.stringify({ name: `${slug(name)}-mobile`, version: '1.0.0', private: true, engines: { node: MobileRuntime.node }, main: 'node_modules/expo/AppEntry.js', scripts: { start: 'expo start', 'export:android': 'expo export --platform android' }, dependencies: { expo: MobileRuntime.expo, react: MobileRuntime.react, 'react-native': MobileRuntime.reactNative } }, null, 2) },
      { ruta: 'mobile/app.json', lenguaje: 'json', contenido: JSON.stringify({ expo: { name, slug: slug(name), version: '1.0.0', platforms: ['android', 'ios'] } }, null, 2) },
      { ruta: 'mobile/.env.example', lenguaje: 'dotenv', contenido: 'EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3000\n' },
      { ruta: 'mobile/icase.manifest.json', lenguaje: 'json', contenido: JSON.stringify({ proyecto: name, pantallas: screens.map(({ id, name, roles, operations, blocks }) => ({ id, name, roles, operations, ...(blocks ? { origen: 'especificacion', componentes: blocks.length } : {}) })) }, null, 2) },
      { ruta: 'mobile/SpecScreen.js', lenguaje: 'javascript', contenido: template('mobile-SpecScreen.js') },
      { ruta: 'mobile/README.md', lenguaje: 'markdown', contenido: '# Aplicación móvil\n\n1. Copia `.env.example` a `.env` y sustituye `YOUR_LAN_IP` por una dirección accesible desde el emulador o dispositivo.\n2. Ejecuta `npm install` y `npm start` en esta carpeta.\n3. Inicia el backend y verifica la conexión desde el dispositivo.\n\nEste proyecto Expo no es un APK o IPA firmado. Las pantallas y operaciones incluidas constan en `icase.manifest.json`.\n' },
      { ruta: 'mobile/App.js', lenguaje: 'javascript', contenido: renderTemplate(template('mobile-App.js'), { AUTH: String(auth), TITLE: JSON.stringify(name), SCREENS: JSON.stringify(screens) }) }
    ];
  }

  _plainText(html) { return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  _escape(value) { return String(value || '').replace(/[<>&{}]/g, ''); }
}

module.exports = GenericFrontendGenerator;
