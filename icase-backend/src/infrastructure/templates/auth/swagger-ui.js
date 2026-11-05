/** Explorador Swagger UI embebido; los estáticos salen de swagger-ui-dist. */
function absoluteAssetPath() {
  return require('swagger-ui-dist').getAbsoluteFSPath();
}

function html() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Documentación de la API</title>
<link rel="stylesheet" href="/api/docs/static/swagger-ui.css"/>
<style>body{margin:0}#swagger-ui{max-width:100%}</style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="/api/docs/static/swagger-ui-bundle.js"></script>
<script src="/api/docs/static/swagger-ui-standalone-preset.js"></script>
<script>
window.ui = SwaggerUIBundle({
  url: '/api/openapi.json',
  dom_id: '#swagger-ui',
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
  layout: 'StandaloneLayout',
  deepLinking: true,
  requestInterceptor: (req) => {
    try {
      const token = window.localStorage.getItem('icase_docs_token');
      if (token) req.headers.Authorization = 'Bearer ' + token;
    } catch (_) {}
    return req;
  }
});
</script>
</body>
</html>`;
}

module.exports = { absoluteAssetPath, html };
