const { randomUUID } = require('node:crypto');

// También cubre controladores antiguos que atrapan errores y llaman res.json directamente.
function responseErrors(req, res, next) {
  const requestId = randomUUID();
  res.setHeader('X-Request-ID', requestId);
  req.requestId = requestId;
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500) {
      console.error('[HTTP]', { requestId, method: req.method, path: req.path, status: res.statusCode });
      return json({
        error: res.statusCode === 503 ? 'Servicio temporalmente no disponible. Inténtalo más tarde.' : 'Error interno del servidor.',
        request_id: requestId
      });
    }
    return json(body);
  };
  next();
}

module.exports = responseErrors;
