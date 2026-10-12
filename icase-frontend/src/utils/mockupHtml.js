export const DEFAULT_DESIGN_SYSTEM = {
  nombre: "Predeterminado I-CASE",
  origen: "predeterminado",
  version: 1,
  colores: {
    primario: "#0b57d0", primario_oscuro: "#073d8c", secundario: "#64748b",
    fondo: "#f8fafc", superficie: "#ffffff", texto: "#0f172a",
    exito: "#059669", alerta: "#d97706", error: "#dc2626"
  }
};

export const prepareMockupHtml = (rawHtml, designSystem = DEFAULT_DESIGN_SYSTEM) => {
  if (!rawHtml) return "";
  let html = rawHtml
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, "")
    .replace(/\s(href|action)\s*=\s*(["'])(.*?)\2/gi, (_m, attr, quote, value) => {
      if (attr.toLowerCase() === "href" && /^https:\/\/fonts\.(googleapis|gstatic)\.com/i.test(value)) return ` ${attr}=${quote}${value}${quote}`;
      return ` data-icase-${attr}=${quote}${value}${quote} ${attr}=${quote}#${quote}`;
    });

  if (!html.includes("cdn.tailwindcss.com")) {
    html = html.replace(/<head>/i, '<head><script src="https://cdn.tailwindcss.com"></script>');
  }
  const colors = designSystem?.colores || DEFAULT_DESIGN_SYSTEM.colores;
  html = html
    .replace(/#0b57d0/gi, colors.primario)
    .replace(/#0947a8/gi, colors.primario_oscuro)
    .replace(/#073d8c/gi, colors.primario_oscuro)
    .replace(/#64748b/gi, colors.secundario);
  const paletteStyles = `<style id="icase-preview-palette">
    :root{--icase-primary:${colors.primario};--icase-primary-dark:${colors.primario_oscuro};--icase-secondary:${colors.secundario};--icase-bg:${colors.fondo};--icase-surface:${colors.superficie};--icase-text:${colors.texto};--icase-success:${colors.exito};--icase-warning:${colors.alerta};--icase-error:${colors.error}}
    html,body{background-color:var(--icase-bg)!important;color:var(--icase-text)!important}
    .bg-blue-500,.bg-blue-600,.bg-blue-700,.bg-primary-500,.bg-primary-600,.bg-primary-700{background-color:var(--icase-primary)!important}
    .hover\\:bg-blue-700:hover,.hover\\:bg-primary-700:hover{background-color:var(--icase-primary-dark)!important}
    .text-blue-500,.text-blue-600,.text-blue-700,.text-primary-500,.text-primary-600,.text-primary-700{color:var(--icase-primary)!important}
    .border-blue-500,.border-blue-600,.border-primary-500,.border-primary-600{border-color:var(--icase-primary)!important}
    .bg-emerald-500,.bg-green-500,.bg-green-600{background-color:var(--icase-success)!important}
    .text-emerald-600,.text-green-600,.text-green-700{color:var(--icase-success)!important}
    .text-amber-600,.text-yellow-600{color:var(--icase-warning)!important}
    .text-red-600,.text-red-700{color:var(--icase-error)!important}
  </style>`;
  html = html.includes("</head>") ? html.replace(/<\/head>/i, `${paletteStyles}</head>`) : `${paletteStyles}${html}`;
  const guard = `<script id="icase-preview-guard">document.addEventListener('click',function(e){var t=e.target.closest('a,button');if(t){e.preventDefault();}} ,true);document.addEventListener('submit',function(e){e.preventDefault();},true);</script>`;
  return html.includes("</body>") ? html.replace(/<\/body>/i, `${guard}</body>`) : `${html}${guard}`;
};
