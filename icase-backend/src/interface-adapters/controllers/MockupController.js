function contraste(hexA, hexB) {
  const luminancia = (hex) => {
    const canales = hex.slice(1).match(/.{2}/g).map(v => parseInt(v, 16) / 255)
      .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * canales[0] + 0.7152 * canales[1] + 0.0722 * canales[2];
  };
  const [mayor, menor] = [luminancia(hexA), luminancia(hexB)].sort((a, b) => b - a);
  return (mayor + 0.05) / (menor + 0.05);
}

class MockupController {
  constructor({
    generarMockupsUseCase,
    actualizarMockupManualUseCase,
    disenoRepository,
    trabajoGeneracionRepository
  }) {
    this.generarMockupsUseCase = generarMockupsUseCase;
    this.actualizarMockupManualUseCase = actualizarMockupManualUseCase;
    this.disenoRepository = disenoRepository;
    this.trabajoGeneracionRepository = trabajoGeneracionRepository;
  }

  async iniciarTrabajo(req, res) {
    try {
      const { proyectoId } = req.params;
      const { pantallas = [], insumoAdicional = '', requerimientos = null, soloReparar = false } = req.body;
      if (typeof soloReparar !== 'boolean') return res.status(400).json({ error: 'soloReparar debe ser booleano' });
      const resultado = await this.trabajoGeneracionRepository.crearORecuperarActivo({
        proyectoId,
        pantallas,
        insumoAdicional,
        requerimientosLocales: requerimientos,
        soloReparar
      });

      if (resultado.creado) {
        this._ejecutarTrabajo(resultado.trabajo.id, {
          proyectoId,
          pantallas,
          insumoAdicional,
          requerimientosLocales: requerimientos,
          soloReparar
        });
      }

      res.status(resultado.creado ? 202 : 200).json({
        trabajo: resultado.trabajo,
        reutilizado: !resultado.creado
      });
    } catch (err) {
      console.error('[MockupController] Error iniciando trabajo:', err);
      res.status(400).json({ error: err.message });
    }
  }

  async obtenerTrabajo(req, res) {
    try {
      const trabajo = await this.trabajoGeneracionRepository.obtenerPorId(req.params.trabajoId);
      if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
      const response = { trabajo };
      if (trabajo.estado === 'completado') {
        const diseno = await this.disenoRepository.obtenerPorProyecto(trabajo.proyecto_id);
        response.mockups = diseno?.mockups || [];
      }
      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async obtenerUltimoTrabajo(req, res) {
    try {
      const trabajo = await this.trabajoGeneracionRepository.obtenerUltimoPorProyecto(req.params.proyectoId);
      if (!trabajo) return res.json({ trabajo: null });
      const response = { trabajo };
      if (trabajo.estado === 'completado') {
        const diseno = await this.disenoRepository.obtenerPorProyecto(req.params.proyectoId);
        response.mockups = diseno?.mockups || [];
      }
      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async _ejecutarTrabajo(trabajoId, payload) {
    try {
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'procesando', progreso: 2, mensaje: 'Preparando generación de mockups'
      });
      const resultado = await this.generarMockupsUseCase.ejecutar({
        ...payload,
        onProgress: (avance) => this.trabajoGeneracionRepository.actualizar(trabajoId, avance)
      });
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'completado',
        progreso: 100,
        mensaje: 'Generación completada',
        proveedor_usado: resultado.proveedorUsado,
        advertencias: resultado.advertencias || [],
        total_generados: resultado.totalProcesados ?? resultado.mockups?.length ?? 0,
        error: null
      }, true);
    } catch (err) {
      console.error(`[MockupController] Trabajo ${trabajoId} falló:`, err);
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'fallido', progreso: 100, mensaje: 'La generación falló', error: err.message
      }, true);
    }
  }

  async generar(req, res) {
    try {
      const { proyectoId } = req.params;
      if (!proyectoId) {
        return res.status(400).json({ error: 'proyectoId es requerido' });
      }

      const { pantallas = [], insumoAdicional = '', requerimientos = null, soloReparar = false } = req.body;
      if (typeof soloReparar !== 'boolean') return res.status(400).json({ error: 'soloReparar debe ser booleano' });

      const resultado = await this.generarMockupsUseCase.ejecutar({
        proyectoId,
        pantallas,
        insumoAdicional,
        requerimientosLocales: requerimientos,
        soloReparar
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

      res.json(await this.generarMockupsUseCase.obtenerCatalogo(proyectoId));
    } catch (err) {
      console.error('[MockupController] Error en listar:', err);
      res.status(500).json({ error: err.message });
    }
  }

  async actualizarSistemaDiseno(req, res) {
    try {
      const { proyectoId } = req.params;
      const actual = await this.disenoRepository.obtenerPorProyecto(proyectoId);
      const recibido = req.body?.sistemaDiseno || req.body || {};
      const normalizado = this.generarMockupsUseCase._normalizarSistemaDiseno(recibido);
      if (normalizado.logo) {
        const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(normalizado.logo);
        const bytes = match ? Buffer.from(match[2], 'base64') : Buffer.alloc(0);
        const valid = match && bytes.length <= 1024 * 1024 && (
          (match[1] === 'png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
          (match[1] === 'jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
          (match[1] === 'webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'));
        if (!valid) return res.status(400).json({ error: 'Logo inválido. Usa PNG, JPEG o WebP de hasta 1 MB.' });
      }
      const colorValido = /^#[0-9a-f]{6}$/i;
      const invalidos = Object.entries(normalizado.colores)
        .filter(([, color]) => !colorValido.test(color))
        .map(([nombre]) => nombre);
      if (invalidos.length) {
        return res.status(400).json({ error: `Colores inválidos: ${invalidos.join(', ')}` });
      }
      const contrastesInsuficientes = ['fondo', 'superficie']
        .filter(clave => contraste(normalizado.colores.texto, normalizado.colores[clave]) < 4.5);
      if (contrastesInsuficientes.length) {
        return res.status(400).json({ error: `La paleta no alcanza contraste WCAG AA entre texto y: ${contrastesInsuficientes.join(', ')}.` });
      }
      normalizado.origen = recibido.origen === 'ia' ? 'ia' : 'manual';
      normalizado.version = (actual?.sistema_diseno?.version || 0) + 1;
      const composer = require('../../infrastructure/services/MockupVisualComposer');
      const validator = this.generarMockupsUseCase.validator;
      const mockups = (actual?.mockups || []).map(mockup => {
        // Legacy HTML remains intact; only the versioned common shell is recomposed.
        if (!String(mockup.preview_code).includes('data-icase-shell-version="1"')) return mockup;
        const html = composer.compose(mockup.preview_code, { screen: { ...mockup, slug: mockup.nombre_pantalla }, manifest: actual.manifiesto_navegacion || [], identity: normalizado });
        return { ...mockup, preview_code: validator.aplicarSistemaDiseno(validator.sanitizar(html).html, normalizado) };
      });
      await this.disenoRepository.guardarOActualizar(proyectoId, { sistema_diseno: normalizado, ...(actual?.mockups ? { mockups } : {}) });
      res.json({ sistemaDiseno: normalizado });
    } catch (err) {
      console.error('[MockupController] Error actualizando sistema visual:', err);
      res.status(400).json({ error: err.message });
    }
  }

  async sugerirSistemaDiseno(req, res) {
    try {
      const sugerencia = await this.generarMockupsUseCase.sugerirSistemaDiseno(req.params.proyectoId);
      res.json({ sistemaDiseno: sugerencia });
    } catch (err) {
      res.status(503).json({ error: err.message });
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
