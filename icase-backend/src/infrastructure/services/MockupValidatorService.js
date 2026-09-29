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