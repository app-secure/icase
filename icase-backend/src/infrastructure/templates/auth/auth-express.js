// Adaptador de Express: autentica cada petición a /api y expone los endpoints de sesión y usuarios.
module.exports = function mountAuth(app, auth) {
  const route = (handler) => async (req, res, next) => {
    try { await handler(req, res); } catch (error) { next(error); }
  };

  app.use(async (req, res, next) => {
    try {
      if (!req.path.startsWith('/api') || auth.isPublic(req.method, req.path)) return next();
      req.user = await auth.authenticate(req.headers.authorization);
      auth.authorize(req.user, req.method, req.path);
      return next();
    } catch (error) { return next(error); }
  });

  app.post('/api/auth/login', route(async (req, res) => res.json(await auth.login((req.body || {}).email, (req.body || {}).password, req.ip))));
  app.post('/api/auth/register', route(async (req, res) => res.status(201).json(await auth.register(req.body, req.ip))));
  app.get('/api/auth/me', route(async (req, res) => res.json({ usuario: auth.publicUser(req.user), permisos: auth.permissionsOf(req.user) })));

  app.get('/api/users', route(async (_req, res) => res.json(await auth.users.list())));
  app.post('/api/users', route(async (req, res) => res.status(201).json(await auth.users.create(req.body))));
  app.patch('/api/users/:id', route(async (req, res) => {
    const user = await auth.users.update(req.params.id, req.body);
    return user ? res.json(user) : res.status(404).json({ message: 'Usuario inexistente' });
  }));
  app.delete('/api/users/:id', route(async (req, res) => {
    const removed = await auth.users.remove(req.params.id, req.user);
    return removed ? res.json({ deleted: true, id: req.params.id }) : res.status(404).json({ message: 'Usuario inexistente' });
  }));
};
