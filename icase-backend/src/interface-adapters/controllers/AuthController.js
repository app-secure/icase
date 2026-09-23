const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../../infrastructure/middlewares/authMiddleware');

class AuthController {
  constructor({ usuarioRepository }) {
    this.usuarioRepository = usuarioRepository;
  }

  async registro(req, res) {
    try {
      const { nombre, apellido, correo, celular, password } = req.body;

      if (!nombre || !apellido || !correo || !celular || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios: Nombre, Apellido, Correo, Celular y Contraseña.' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      }

      const existeUsuario = await this.usuarioRepository.obtenerPorCorreo(correo);
      if (existeUsuario) {
        return res.status(409).json({ error: 'Ya existe una cuenta registrada con este correo electrónico.' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const nuevoUsuario = await this.usuarioRepository.crear({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        correo: correo.trim().toLowerCase(),
        celular: celular.trim(),
        password: hashedPassword
      });

      const token = jwt.sign(
        {
          id: nuevoUsuario.id,
          correo: nuevoUsuario.correo,
          nombre: nuevoUsuario.nombre,
          apellido: nuevoUsuario.apellido
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.status(201).json({
        success: true,
        message: 'Usuario registrado con éxito',
        usuario: nuevoUsuario,
        token
      });
    } catch (err) {
      console.error('[AuthController] Error en registro:', err);
      return res.status(500).json({ error: err.message || 'Error en el servidor al registrar usuario' });
    }
  }

  async login(req, res) {
    try {
      const { correo, password } = req.body;

      if (!correo || !password) {
        return res.status(400).json({ error: 'Por favor ingrese su correo electrónico y contraseña.' });
      }

      const usuarioDoc = await this.usuarioRepository.obtenerPorCorreo(correo);
      if (!usuarioDoc) {
        return res.status(401).json({ error: 'Credenciales inválidas: Correo o contraseña incorrectos.' });
      }

      const passwordValida = await bcrypt.compare(password, usuarioDoc.password);
      if (!passwordValida) {
        return res.status(401).json({ error: 'Credenciales inválidas: Correo o contraseña incorrectos.' });
      }

      const usuarioJson = usuarioDoc.toJSON();

      const token = jwt.sign(
        {
          id: usuarioJson.id,
          correo: usuarioJson.correo,
          nombre: usuarioJson.nombre,
          apellido: usuarioJson.apellido
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        message: 'Sesión iniciada con éxito',
        usuario: usuarioJson,
        token
      });
    } catch (err) {
      console.error('[AuthController] Error en login:', err);
      return res.status(500).json({ error: err.message || 'Error en el servidor al iniciar sesión' });
    }
  }

  async perfil(req, res) {
    try {
      const usuario = await this.usuarioRepository.obtenerPorId(req.usuario.id);
      if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      return res.json(usuario);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = AuthController;
