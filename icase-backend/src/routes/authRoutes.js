const express = require('express');
const { authMiddleware } = require('../infrastructure/middlewares/authMiddleware');

function buildAuthRoutes(authController) {
  const router = express.Router();

  router.post('/registro', (req, res) => authController.registro(req, res));
  router.post('/login', (req, res) => authController.login(req, res));
  router.get('/perfil', authMiddleware, (req, res) => authController.perfil(req, res));

  return router;
}

module.exports = buildAuthRoutes;
