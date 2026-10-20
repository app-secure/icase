const crypto = require('crypto');
const IGeneradorArtefacto = require('../../core/services/IGeneradorArtefacto');
const GenericFrontendGenerator = require('./GenericFrontendGenerator');
const StackCatalog = require('../../core/services/StackCatalog');

const slug = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pantalla';
const componentName = (value) => slug(value).split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');

class FrontendScaffoldGenerator extends IGeneradorArtefacto {
  async generar({ proyecto, insumos, versionesOrigen }) {
    const { decisiones, diseno } = insumos;
    StackCatalog.resolve(decisiones.stack_tecnologico || {}); // no se sustituye en silencio un stack no soportado
    const manifest = Array.isArray(diseno.manifiesto_navegacion) ? diseno.manifiesto_navegacion : [];
    const mockups = Array.isArray(diseno.mockups) ? diseno.mockups : [];
    const mockupMap = new Map(mockups.map((item) => [item.pantalla_id || item.nombre_pantalla, item]));
    const screens = manifest.length ? manifest.map((screen) => ({ ...screen, mockup: mockupMap.get(screen.pantalla_id) || mockupMap.get(screen.slug) }))
      : mockups.map((mockup) => ({ ...mockup, nombre: mockup.nombre_visible, slug: mockup.nombre_pantalla, mockup }));
    const files = new GenericFrontendGenerator().generate({ proyecto, screens, decisiones, sistemaDiseno: diseno.sistema_diseno || {} });
    const missing = screens.filter((screen) => !screen.mockup).map((screen) => screen.nombre || screen.slug);
    return {
      archivos: files.map((file) => ({ ...file, huella: crypto.createHash('sha256').update(file.contenido).digest('hex') })),
      trazabilidad_rf: [...new Set(screens.flatMap((screen) => screen.rf_trazabilidad || screen.mockup?.rf_trazabilidad || []))],
      advertencias: [...(missing.length ? [`Pantallas del árbol sin mockup asociado: ${missing.join(', ')}.`] : []), ...(!screens.length ? ['No existen pantallas aprobadas para conectar.'] : []), ...(screens.some((screen) => !(screen.rf_trazabilidad || screen.mockup?.rf_trazabilidad || []).length) ? ['Hay pantallas sin trazabilidad RF; no tendrán una operación de negocio asociada.'] : [])],
      versiones_origen: versionesOrigen,
      generado_por: 'generador_frontend_generico_v2'
    };
  }

  _files({ proyecto, decisiones, diseno, screens }) {
    const imports = screens.map((screen) => `import ${componentName(screen.slug || screen.nombre)} from './pages/${slug(screen.slug || screen.nombre)}';`).join('\n');
    const routes = screens.map((screen) => `        <Route path="${this._route(screen)}" element={<${componentName(screen.slug || screen.nombre)} />} />`).join('\n');
    const colors = diseno.sistema_diseno?.colores || {};
    const files = [
      { ruta: 'frontend/package.json', lenguaje: 'json', contenido: JSON.stringify({ name: `${slug(proyecto.nombre)}-frontend`, version: '0.1.0', private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0', 'react-router-dom': '^7.0.0' }, devDependencies: { '@vitejs/plugin-react': '^5.0.0', autoprefixer: '^10.4.0', postcss: '^8.4.0', tailwindcss: '^3.4.0', vite: '^7.0.0' } }, null, 2) },
      { ruta: 'frontend/vite.config.js', lenguaje: 'javascript', contenido: "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n" },
      { ruta: 'frontend/tailwind.config.js', lenguaje: 'javascript', contenido: "export default { content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'], theme: { extend: {} }, plugins: [] };\n" },
      { ruta: 'frontend/postcss.config.js', lenguaje: 'javascript', contenido: "export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n" },
      { ruta: 'frontend/index.html', lenguaje: 'html', contenido: '<!doctype html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>' + proyecto.nombre + '</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>' },
      { ruta: 'frontend/src/main.jsx', lenguaje: 'javascript', contenido: `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { BrowserRouter } from 'react-router-dom';\nimport App from './App';\nimport './styles.css';\n\ncreateRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);\n` },
      { ruta: 'frontend/src/App.jsx', lenguaje: 'javascript', contenido: `import React from 'react';\nimport { Navigate, Route, Routes } from 'react-router-dom';\n${imports}\n\nexport default function App() {\n  return <Routes>\n${routes}\n        <Route path="*" element={<Navigate to="${screens.length ? this._route(screens[0]) : '/'}" replace />} />\n      </Routes>;\n}\n` },
      { ruta: 'frontend/src/styles.css', lenguaje: 'css', contenido: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n:root{font-family:Inter,system-ui,sans-serif;color:${colors.texto || '#0f172a'};background:${colors.fondo || '#f8fafc'};--color-primary:${colors.primario || '#0b57d0'};--color-surface:${colors.superficie || '#fff'}}*{box-sizing:border-box}body{margin:0;min-width:320px;min-height:100vh}.icase-screen{min-height:100vh;background:var(--color-surface)}\n` },
      { ruta: 'frontend/icase.manifest.json', lenguaje: 'json', contenido: JSON.stringify({ proyecto: proyecto.nombre, stack: decisiones.stack_tecnologico, pantallas: screens.map((screen) => ({ nombre: screen.nombre, ruta: this._route(screen), roles: screen.roles || [], rf: screen.rf_trazabilidad || screen.mockup?.rf_trazabilidad || [] })) }, null, 2) }
    ];
    for (const screen of screens) {
      const screenSlug = slug(screen.slug || screen.nombre);
      const body = this._body(screen.mockup?.preview_code || '');
      files.push({ ruta: `frontend/src/pages/${screenSlug}.jsx`, lenguaje: 'javascript', contenido: `import React from 'react';\n\nconst markup = ${JSON.stringify(body)};\n\nexport default function ${componentName(screenSlug)}() {\n  return <main className="icase-screen" data-screen="${screenSlug}" dangerouslySetInnerHTML={{ __html: markup }} />;\n}\n` });
      if (screen.mockup?.preview_code) files.push({ ruta: `frontend/mockups-reference/${screenSlug}.html`, lenguaje: 'html', contenido: screen.mockup.preview_code });
    }
    return files;
  }

  _route(screen) {
    const route = String(screen.ruta || '').trim();
    return route.startsWith('/') ? route : `/${route || slug(screen.slug || screen.nombre)}`;
  }

  _body(html) {
    const safe = String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*(["']).*?\1/gi, '');
    return safe.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]?.trim() || safe || '<section><h1>Pantalla pendiente</h1></section>';
  }
}

module.exports = FrontendScaffoldGenerator;
