/** Explorador Swagger UI embebido; los estáticos salen de swagger-ui-dist. */
function absoluteAssetPath() {
  return require('swagger-ui-dist').getAbsoluteFSPath();
}

/**
 * La página es pública (no trae datos): un navegador no puede enviar el encabezado Authorization al abrir una dirección.
 * Pide el inicio de sesión aquí mismo, guarda el token en el navegador y recién entonces carga el documento (que sigue protegido).
 */
function html() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Documentación de la API</title>
<link rel="stylesheet" href="/api/docs/static/swagger-ui.css"/>
<style>
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}#swagger-ui{max-width:100%}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 16px;background:#0f172a;color:#e2e8f0;font-size:14px}
.bar strong{margin-right:auto}.bar input{padding:6px 8px;border:1px solid #475569;border-radius:6px;background:#1e293b;color:#fff}
.bar button{padding:6px 12px;border:0;border-radius:6px;background:#38bdf8;color:#0f172a;font-weight:600;cursor:pointer}
.bar .out{background:#334155;color:#fff}#msg{color:#fca5a5}#login[hidden],#session[hidden]{display:none}
#login,#session{display:flex;align-items:center;gap:8px}
</style>
</head>
<body>
<div class="bar">
  <strong>Documentación de la API</strong>
  <form id="login" hidden>
    <input id="email" type="email" placeholder="Correo" autocomplete="username" required/>
    <input id="password" type="password" placeholder="Contraseña" autocomplete="current-password" required/>
    <button type="submit">Iniciar sesión</button>
  </form>
  <span id="session" hidden><span id="who"></span><button class="out" id="logout" type="button">Cerrar sesión</button></span>
  <span id="msg" role="alert"></span>
</div>
<div id="swagger-ui"></div>
<script src="/api/docs/static/swagger-ui-bundle.js"></script>
<script src="/api/docs/static/swagger-ui-standalone-preset.js"></script>
<script src="/api/docs/init.js"></script>
</body>
</html>`;
}

/** Código de la página. Se sirve como archivo propio: la política de seguridad (CSP) de la aplicación no admite scripts en línea. */
function script() {
  return `(function () {
  var KEY = 'icase_docs_token';
  var $ = function (id) { return document.getElementById(id); };
  var read = function () { try { return window.localStorage.getItem(KEY) || ''; } catch (_) { return ''; } };
  var write = function (value) { try { if (value) window.localStorage.setItem(KEY, value); else window.localStorage.removeItem(KEY); } catch (_) {} };
  var started = false;
  function show(signedIn, who) {
    $('login').hidden = signedIn;
    $('session').hidden = !signedIn;
    $('who').textContent = who ? 'Sesión: ' + who : '';
  }
  function start() {
    if (started) { window.location.reload(); return; }
    started = true;
    window.ui = SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout',
      deepLinking: true,
      requestInterceptor: function (req) {
        var token = read();
        if (token) req.headers.Authorization = 'Bearer ' + token;
        return req;
      }
    });
  }
  function begin(who) { show(true, who); $('msg').textContent = ''; start(); }
  async function check() {
    var token = read();
    // En una aplicación sin autenticación el documento se sirve directo; con ella, sin token responde 401.
    var response = await fetch('/api/openapi.json', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (response.ok) { if (token) begin('activa'); else { show(false); $('login').hidden = true; start(); } return; }
    write('');
    show(false);
    $('msg').textContent = 'Inicia sesión para ver y probar la API.';
  }
  $('login').addEventListener('submit', async function (event) {
    event.preventDefault();
    $('msg').textContent = '';
    try {
      var response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('email').value, password: $('password').value }) });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.token) { $('msg').textContent = data.message || 'No se pudo iniciar sesión.'; return; }
      write(data.token);
      begin($('email').value);
    } catch (error) { $('msg').textContent = 'No se pudo conectar con el servidor.'; }
  });
  $('logout').addEventListener('click', function () { write(''); window.location.reload(); });
  check();
})();
`;
}

module.exports = { absoluteAssetPath, html, script };
