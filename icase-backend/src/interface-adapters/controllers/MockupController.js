class MockupController {
  constructor({
    generarMockupsUseCase,
    actualizarMockupManualUseCase,
    disenoRepository
  }) {
    this.generarMockupsUseCase = generarMockupsUseCase;
    this.actualizarMockupManualUseCase = actualizarMockupManualUseCase;
    this.disenoRepository = disenoRepository;
  }

  async generar(req, res) {
    try {
      const { proyectoId } = req.params;
      if (!proyectoId) {
        return res.status(400).json({ error: 'proyectoId es requerido' });
      }

      const { pantallas = [], insumoAdicional = '', requerimientos = null } = req.body;

      const resultado = await this.generarMockupsUseCase.ejecutar({
        proyectoId,
        pantallas,
        insumoAdicional,
        requerimientosLocales: requerimientos
      });

      const mockups = Array.isArray(resultado) ? resultado : (resultado.mockups || []);
      const proveedorUsado = resultado?.proveedorUsado || null;
      const advertencias = resultado?.advertencias || [];

      res.json({
        mockups,
        proveedorUsado,
        advertencias
      });
    } catch (err) {
      console.error('[MockupController] Error en generar:', err);
      res.status(500).json({ error: err.message });
    }
  }

  async listar(req, res) {
    try {
      const { proyectoId } = req.params;
      if (!proyectoId) {
        return res.status(400).json({ error: 'proyectoId es requerido' });
      }

      const diseno = await this.disenoRepository.obtenerPorProyecto(proyectoId);
      if (!diseno) {
        return res.json({ mockups: [] });
      }

      res.json({ mockups: diseno.mockups || [] });
    } catch (err) {
      console.error('[MockupController] Error en listar:', err);
      res.status(500).json({ error: err.message });
    }
  }

  async actualizar(req, res) {
    try {
      const { proyectoId, nombrePantalla } = req.params;
      if (!proyectoId || !nombrePantalla) {
        return res.status(400).json({ error: 'proyectoId y nombrePantalla son requeridos' });
      }

      const { previewCode } = req.body;
      if (!previewCode) {
        return res.status(400).json({ error: 'previewCode es requerido' });
      }

      const resultado = await this.actualizarMockupManualUseCase.ejecutar({
        proyectoId,
        nombrePantalla: decodeURIComponent(nombrePantalla),
        previewCode
      });

      res.json(resultado);
    } catch (err) {
      console.error('[MockupController] Error en actualizar:', err);
      if (err.message.includes('no encontrado')) {
        res.status(404).json({ error: err.message });
      } else {
        res.status(400).json({ error: err.message });
      }
    }
  }

  async eliminar(req, res) {
    try {
      const { proyectoId, nombrePantalla } = req.params;
      if (!proyectoId || !nombrePantalla) {
        return res.status(400).json({ error: 'proyectoId y nombrePantalla son requeridos' });
      }

      const diseno = await this.disenoRepository.obtenerPorProyecto(proyectoId);
      if (!diseno) {
        return res.status(404).json({ error: 'Diseño no encontrado' });
      }

      const mockups = (diseno.mockups || []).filter(m => m.nombre_pantalla !== decodeURIComponent(nombrePantalla));

      await this.disenoRepository.guardarOActualizar(proyectoId, { mockups });

      res.json({ success: true });
    } catch (err) {
      console.error('[MockupController] Error en eliminar:', err);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = MockupController;