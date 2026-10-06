class MockupValidatorService {
  constructor() {
    this.cdnPermitido = 'https://cdn.tailwindcss.com';
  }

  detectar(html) {
    if (!html || typeof html !== 'string') {
      return [];
    }

    const hallazgos = [];
    const patrones = [
      /<script\b(?![^>]*cdn\.tailwindcss\.com)[^>]*>[\s\S]*?<\/script>/gi,
      /on\w+\s*=/gi,
      /javascript:/gi,
      /<iframe\b/gi,
      /<object\b/gi,
      /<embed\b/gi
    ];

    for (const patron of patrones) {
      let match;
      while ((match = patron.exec(html)) !== null) {
        hallazgos.push({
          patron: patron.source,
          coincidencia: match[0],
          indice: match.index
        });
      }
    }

    return hallazgos;
  }

  sanitizar(html) {
    if (!html || typeof html !== 'string') {
      return { html: '', advertencias: ['HTML vacío o inválido'] };
    }

    let sanitizado = html;
    const advertencias = [];

    // Preservar tailwind cdn y tailwind.config, remover cualquier otro script
    sanitizado = sanitizado.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, content) => {
      if (attrs.includes('cdn.tailwindcss.com') || match.includes('cdn.tailwindcss.com')) {
        return '<script src="https://cdn.tailwindcss.com"></script>';
      }
      if (content.includes('tailwind.config')) {
        return `<script>${content}</script>`;
      }
      advertencias.push('Script peligroso o no autorizado eliminado');
      return '';
    });

    // Remover etiquetas peligrosas
    const etiquetas = [/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, /<object\b[^>]*>[\s\S]*?<\/object>/gi, /<embed\b[^>]*>/gi];
    for (const p of etiquetas) {
      if (p.test(sanitizado)) {
        advertencias.push('Etiqueta potencialmente insegura eliminada');
        sanitizado = sanitizado.replace(p, '');
      }
    }

    // Remover on* handlers
    if (/on\w+\s*=/i.test(sanitizado)) {
      advertencias.push('Manejadores inline on* eliminados');
      sanitizado = sanitizado.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    }

    // Remover javascript:
    if (/javascript\s*:/i.test(sanitizado)) {
      advertencias.push('Enlaces javascript: eliminados');
      sanitizado = sanitizado.replace(/(href|src)\s*=\s*["']\s*javascript:[^"']*["']/gi, '$1="#"');
    }

    // Una maqueta nunca debe depender de archivos del equipo que ejecutó la IA.
    if (/(?:src|href)\s*=\s*["'](?:file:\/\/\/|[a-z]:\\\\|\\\\\\\\)/i.test(sanitizado)) {
      advertencias.push('Referencia a archivo local eliminada');
      sanitizado = sanitizado.replace(/(src|href)\s*=\s*(["'])(?:file:\/\/\/|[a-z]:\\\\|\\\\\\\\)[\s\S]*?\2/gi, '$1="#"');
    }

    // Asegurar CDN de Tailwind si no está presente
    if (!sanitizado.includes('cdn.tailwindcss.com') && sanitizado.includes('</head>')) {
      sanitizado = sanitizado.replace('</head>', '  <script src="https://cdn.tailwindcss.com"></script>\n</head>');
    }

    // Asegurar Google Fonts Inter
    if (!sanitizado.includes('fonts.googleapis.com') && sanitizado.includes('</head>')) {
      sanitizado = sanitizado.replace('</head>', '  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n</head>');
    }

    return { html: sanitizado, advertencias };
  }

  validar(html) {
    const errores = [];
    const advertencias = [];
    const codigo = String(html || '');

    if (!this.listo(codigo)) errores.push('El documento HTML está incompleto o truncado');
    if (!/<body\b/i.test(codigo)) errores.push('Falta la etiqueta body');
    if (!/(?:<style\b|cdn\.tailwindcss\.com|class=["'][^"']*(?:flex|grid|bg-|p-|m-|text-))/i.test(codigo)) {
      errores.push('La pantalla no contiene estilos verificables');
    }
    if (/(?:src|href)\s*=\s*["'](?:file:\/\/\/|[a-z]:\\\\|\\\\\\\\)/i.test(codigo)) {
      errores.push('Contiene rutas a archivos locales');
    }
    if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(codigo)) advertencias.push('Hay imágenes sin texto alternativo');
    if (/<img\b[^>]*src=["'](?:#|\s*)["']/i.test(codigo)) errores.push('Contiene imágenes sin una fuente válida');
    if (/lorem ipsum|todo:\s|undefined|null\s*<\/|\{\{[^}]+\}\}/i.test(codigo)) {
      advertencias.push('Contiene texto genérico o marcadores sin resolver');
    }

    return {
      valido: errores.length === 0,
      estado: errores.length ? 'invalido' : (advertencias.length ? 'advertencia' : 'valido'),
      errores,
      advertencias
    };
  }

  aplicarSistemaDiseno(html, sistemaDiseno) {
    if (!html || !sistemaDiseno?.colores) return html;
    const c = sistemaDiseno.colores;
    let resultado = html
      .replace(/#0b57d0/gi, c.primario)
      .replace(/#0947a8/gi, c.primario_oscuro)
      .replace(/#073d8c/gi, c.primario_oscuro)
      .replace(/#64748b/gi, c.secundario);

    resultado = resultado.replace(/<style\b[^>]*id=["']icase-design-system["'][^>]*>[\s\S]*?<\/style>/gi, '');
    const estilos = `<style id="icase-design-system">
:root{--icase-primary:${c.primario};--icase-primary-dark:${c.primario_oscuro};--icase-secondary:${c.secundario};--icase-bg:${c.fondo};--icase-surface:${c.superficie};--icase-text:${c.texto};--icase-success:${c.exito};--icase-warning:${c.alerta};--icase-error:${c.error}}
html,body{background-color:var(--icase-bg)!important;color:var(--icase-text)!important}
.bg-blue-500,.bg-blue-600,.bg-blue-700,.bg-primary-500,.bg-primary-600,.bg-primary-700{background-color:var(--icase-primary)!important}
.text-blue-500,.text-blue-600,.text-blue-700,.text-primary-500,.text-primary-600,.text-primary-700{color:var(--icase-primary)!important}
.border-blue-500,.border-blue-600,.border-primary-500,.border-primary-600{border-color:var(--icase-primary)!important}
.bg-emerald-500,.bg-green-500,.bg-green-600{background-color:var(--icase-success)!important}
.text-emerald-600,.text-green-600,.text-green-700{color:var(--icase-success)!important}
.text-amber-600,.text-yellow-600{color:var(--icase-warning)!important}
.text-red-600,.text-red-700{color:var(--icase-error)!important}
</style>`;
    return resultado.includes('</head>')
      ? resultado.replace(/<\/head>/i, `${estilos}</head>`)
      : `${estilos}${resultado}`;
  }

  listo(html) {
    if (!html || typeof html !== 'string') {
      return false;
    }
    const trimmed = html.trim().toLowerCase();
    return (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) &&
           trimmed.includes('</html>');
  }
}

module.exports = MockupValidatorService;
