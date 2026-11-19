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
        (isAuthScreen(screens[index]) && view.requirements.every((id) => loginIds.has(String(id).toUpperCase())))
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
      { ruta: 'frontend/src/styles.css', lenguaje: 'css', contenido: `:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${colors.texto || '#0f172a'};background:#f1f5f9;--primary:${colors.primario || '#4f46e5'};--primary-hover:#4338ca}*{box-sizing:border-box}.mockup-screen{width:100%;max-width:none;margin:0;padding:0}body{margin:0;background:#f1f5f9;color:#0f172a;line-height:1.5}.app-shell{min-height:100vh;display:flex;flex-direction:column}.nav{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;padding:.75rem 1.75rem;background:white;border-bottom:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,.04)}.nav-brand{font-size:1.15rem;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:.5rem;text-decoration:none}.nav-links{display:flex;align-items:center;gap:.5rem;overflow-x:auto;padding:.25rem 0}.nav-link{text-decoration:none;color:#475569;font-size:.875rem;font-weight:500;padding:.45rem .85rem;border-radius:6px;transition:all .15s;white-space:nowrap}.nav-link:hover{background:#f1f5f9;color:#0f172a}.nav-link.active{background:#ede9fe;color:#4f46e5;font-weight:600}.nav-user{display:flex;align-items:center;gap:1rem;font-size:.875rem;color:#475569}.user-badge{background:#f1f5f9;padding:.35rem .75rem;border-radius:9999px;font-weight:500;border:1px solid #e2e8f0}.screen{max-width:1200px;width:100%;margin:1.5rem auto;padding:0 1.5rem}.screen h1{font-size:1.65rem;font-weight:700;color:#0f172a;margin:0 0 1rem 0;letter-spacing:-.02em}.card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:1.5rem;margin:1.25rem 0;box-shadow:0 1px 3px rgba(0,0,0,.03)}.card h2{font-size:1.15rem;font-weight:600;margin:0 0 1rem 0;color:#1e293b}.field{width:100%;min-height:2.65rem;padding:.6rem .85rem;font:inherit;font-size:.9rem;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;outline:none;transition:border-color .15s}.field:focus{border-color:var(--primary);background:white}.button{border:0;border-radius:8px;padding:.55rem 1.15rem;font-size:.875rem;font-weight:500;cursor:pointer;background:var(--primary);color:white;transition:opacity .15s,transform .05s;display:inline-flex;align-items:center;gap:.5rem}.button:hover{opacity:.92}.button:active{transform:scale(.98)}.button:disabled{opacity:.5;cursor:not-allowed}.danger{background:#ef4444!important}.danger:hover{background:#dc2626!important}.tabs{display:flex;gap:.5rem;margin-bottom:1rem}.tabs button{background:#e2e8f0;color:#334155}.tabs button.active{background:var(--primary);color:white}.record{white-space:pre-wrap;background:#f8fafc;padding:1rem;border-radius:8px;border:1px solid #e2e8f0}.error{color:#dc2626;background:#fef2f2;border:1px solid #fecaca;padding:.75rem 1rem;border-radius:8px;font-size:.875rem}.success{color:#059669;background:#ecfdf5;border:1px solid #a7f3d0;padding:.75rem 1rem;border-radius:8px;font-size:.875rem}${typedForms ? TYPED_FORMS_CSS : ''}` },
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
      const specActionMap = specFound ? this._specActionMap(specFound.actions, spec) : null;
      const wired = jsxBody.includes('handleAction(');
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
        contenido: `import React, { ${specFound ? 'useEffect, useRef, ' : ''}useState } from 'react';\nimport OperationScreen from '../OperationScreen';\n${usesLink ? "import { Link } from 'react-router-dom';\n" : ''}${usesReferences ? "import ReferenceOptions from '../ReferenceOptions';\n" : ''}${css.trim() ? `import './${view.id}.css';\n` : ''}${wired ? "import { useSession } from '../session';\nimport { runAction } from '../mockupActions';\nimport MockupResult from '../MockupResult';\n" : ''}${specFound && !wired ? "import { useSession } from '../session';\n" : ''}${specFound ? `import { SpecBlock } from '../SpecComponents';\nconst specActions = ${JSON.stringify(specFound.actions)};\nconst specBlocks = ${JSON.stringify(specFound.blocks)};\nconst specMap = ${JSON.stringify(specActionMap)};\nimport { bindLiveTables, bindLines } from '../liveTables';\n` : ''}const referenceText=${JSON.stringify(reference)};\nexport default function ${name}(){\n  const [showCrud, setShowCrud] = useState(false);\n${specFound ? "  const mockupRef = useRef(null);\n  const [version, setVersion] = useState(0);\n  const { api: liveApi, can: liveCan } = useSession();\n  useEffect(() => { if (!showCrud && mockupRef.current) bindLines({ root: mockupRef.current, specMap, api: liveApi }); bindLiveTables({ root: mockupRef.current, blocks: specBlocks, actions: specActions, api: liveApi, can: liveCan, onAction: " + (wired ? 'handleAction' : 'undefined') + ", onShowOperations: () => setShowCrud(true) }); }, [showCrud, version, liveApi]);\n" : ''}${wired ? "  const [result, setResult] = useState(null);\n  const [selected, setSelected] = useState(null);\n  const { api, can } = useSession();\n  const handleAction = (event, operation, verb) => runAction({ event, operation, verb, api, can, selected, onSelect: setSelected, onResult: " + (specFound ? "(next) => { setResult(next); if (next && next.estado === 'ok' && !next.registros) setVersion((n) => n + 1); }" : 'setResult') + (specFound ? ', acciones: specMap' : '') + (Object.keys(usersMap).length ? `, identidad: ${JSON.stringify(usersMap)}` : '') + " });\n" : ''}  return (\n    <main ${jsxBody ? "className={showCrud ? 'page-container screen' : 'mockup-screen'}" : 'className="page-container screen"'} data-screen=${JSON.stringify(view.id)}>\n      ${jsxBody ? `<div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', gap: '0.75rem', alignItems: 'center' }}>\n        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Vista:</span>\n        <button type="button" className={'button' + (!showCrud ? '' : ' secondary')} style={{ padding: '0.35rem 0.85rem', fontSize: '0.82rem' }} onClick={() => setShowCrud(false)}>✨ Interfaz Diseñada</button>\n        <button type="button" className={'button' + (showCrud ? '' : ' secondary')} style={{ padding: '0.35rem 0.85rem', fontSize: '0.82rem' }} onClick={() => setShowCrud(true)}>${specFound ? '⚙️ Operaciones' : '⚙️ Gestión de Datos (API)'}</button>\n      </div>` : ''}\n      ${jsxBody ? `{!showCrud ? (\n        <div className="mockup-view-wrapper" style={{ minHeight: 'calc(100vh - 120px)' }}>\n          <div ${specFound ? 'ref={mockupRef} ' : ''}className="mockup-content mockup-${view.id}${bodyClass ? ` ${bodyClass}` : ''}"${bodyStyle ? ` style={${JSON.stringify(bodyStyle)}}` : ''}>${wired ? '<MockupResult result={result} selected={selected} onSelect={setSelected} />' : ''}${jsxBody}</div>\n        </div>\n      ) : (\n        ${specFound ? '<div className="spec-page">{specBlocks.map((block, index) => <SpecBlock key={index} block={block} actions={specActions} />)}</div>' : `<OperationScreen title=${JSON.stringify(view.name)} capabilities={${JSON.stringify(view.operations)}} referenceText={referenceText} asChild />`}\n      )}` : `<OperationScreen title=${JSON.stringify(view.name)} capabilities={${JSON.stringify(view.operations)}} referenceText={referenceText} asChild />`}\n    </main>\n  );\n}\n`
      });
      if (screen?.mockup?.preview_code) files.push({ ruta: `frontend/mockups-reference/${view.id}.html`, lenguaje: 'html', contenido: screen.mockup.preview_code });
    }
    if (anyWired || specSummaries.size) {
      files.push(
        { ruta: 'frontend/src/mockupActions.js', lenguaje: 'javascript', contenido: template('mockup-actions.js') },
        { ruta: 'frontend/src/MockupResult.jsx', lenguaje: 'javascript', contenido: template('MockupResult.jsx') }
      );
    }
    if (specSummaries.size) {
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
    const first = views[0]?.route || '/';
    files.push({ ruta: 'frontend/src/App.jsx', lenguaje: 'javascript', contenido: auth ? this._appWithAuth(proyecto, views, imports, routes, standalone) : this._app(proyecto, views, imports, routes, first, standalone) });
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
      return [operation, { name: action.name, type: action.type, method: action.method, path: action.path, byId: action.byId, capability: action.capability, ...(action.permission && action.permission !== action.capability ? { permiso: action.permission } : {}), entity: action.entity, filters: action.filters, fields: action.fields, inputs: action.inputs, output: action.output, ...(action.lineas?.capability ? { lineas: { referencia: action.lineas.referencia, cantidad: action.lineas.cantidad, destino: action.lineas.destino, precio: action.lineas.precio?.desde || null } } : {}) }];
    }));
    return { blocks, actions, used };
  }

  /** `rf-15.crear` → la operación de la especificación que guarda: un botón del mockup llama a la operación con nombre y no a un CRUD genérico. */
  _specActionMap(screenActions, spec) {
    const verb = { consulta: 'consultar', crear: 'crear', actualizar: 'editar', transicion: 'editar', eliminar: 'eliminar' };
    const map = {};
    const add = (action) => {
      const key = `${String(action.capability).toLowerCase()}.${verb[action.type]}`;
      if (verb[action.type] && !map[key]) map[key] = { name: action.name, method: action.method, path: action.path, byId: Boolean(action.byId), inputs: action.inputs || [], ...(action.lineas ? { lineas: { referencia: action.lineas.referencia, cantidad: action.lineas.cantidad } } : {}), booleanos: (action.inputs || []).filter((name) => action.fields?.[name]?.type === 'boolean') };
    };
    Object.values(screenActions || {}).forEach(add);
    (spec?.acciones || []).forEach(add);
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
  _appWithAuth(proyecto, views, imports, routes, standalone = []) {
    return `import React, { useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './session';
import LoginScreen from './LoginScreen';
import UsersScreen from './UsersScreen';
${imports.join('\n')}

const views = ${JSON.stringify(views.map((view) => ({ route: view.route, name: view.name, operations: view.operations, roles: view.roles, modulo: view.modulo || 'General' })))};
const normalizarRol = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const puedeAbrirPantalla = (view, user, can) => {
  const roles = view.roles || [];
  const rolPermitido = !roles.length || roles.some((rol) => ['usuario', normalizarRol(user.rol)].includes(normalizarRol(rol)));
  return rolPermitido && (!view.operations.length || view.operations.some((operation) => can(operation, 'GET')));
};

export default function App() {
  const { user, loading, can, logout } = useSession();
  const location = useLocation();
  const standalone = ${JSON.stringify(standalone)};
  const [openModule, setOpenModule] = useState(null);

  if (loading) return <main className="screen"><p role="status">Cargando…</p></main>;
  if (!user) return <LoginScreen />;

  const visible = views
    .filter((view) => view.route !== '/usuarios' && view.id !== 'usuarios' && view.name?.toLowerCase() !== 'usuarios')
    .filter((view) => puedeAbrirPantalla(view, user, can));

  const modules = Array.from(new Set(visible.map((v) => v.modulo || 'General')));
  const home = visible[0]?.route || (user.administrador ? '/usuarios' : '/sin-acceso');

  return (
    <div className="app-shell" style={{ background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 1.75rem', background: '#0f172a', color: 'white', borderBottom: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link to={home} className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'white', textDecoration: 'none', fontWeight: '700', fontSize: '1.1rem' }}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: '#38bdf8' }}></span>
            ${this._escape(proyecto.nombre)}
          </Link>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {!standalone.includes(location.pathname) && modules.map((mod) => {
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
          ${views.map((view, index) => `<Route path=${JSON.stringify(view.route)} element={visible.some((item) => item.route === ${JSON.stringify(view.route)}) ? <${component(view.id)}/> : <Navigate to={home} replace />}/>`).join('\n          ')}
          {user.administrador && <Route path="/usuarios" element={<UsersScreen />} />}
          <Route path="/sin-acceso" element={<section className="screen" role="status"><h1>Sin pantallas disponibles</h1><p>Tu rol no tiene acceso a ninguna pantalla de esta aplicación. Solicita los permisos necesarios al administrador.</p></section>} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
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
