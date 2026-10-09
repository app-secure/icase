const MockupValidatorService = require('../../infrastructure/services/MockupValidatorService');

class GenerarMockups {
  constructor({
    proyectoRepository,
    requerimientoRepository,
    diagramaRepository,
    disenoRepository,
    mockupIaService
  }) {
    this.proyectoRepository = proyectoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.disenoRepository = disenoRepository;
    this.mockupIaService = mockupIaService;
    this.validator = new MockupValidatorService();
  }

  async ejecutar({ proyectoId, pantallas = [], insumoAdicional = '', requerimientosLocales = null, onProgress = null }) {
    const proyecto = await this.proyectoRepository.obtenerPorId(proyectoId);
    if (!proyecto) {
      throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
    }

    const estadosPermitidos = new Set([
      'diagramas_aprobados',
      'mockups_pendientes',
      'mockups_aprobados',
      // Compatibilidad con proyectos creados antes de separar ambas aprobaciones.
      'diseno_aprobado',
      'finalizado'
    ]);
    if (proyecto.estado_fase && !estadosPermitidos.has(proyecto.estado_fase)) {
      throw new Error('Debes aprobar los cuatro diagramas antes de generar o regenerar mockups.');
    }

    const reqRepo = this.requerimientoRepository;
    let requerimientos = typeof reqRepo.listarPorProyecto === 'function'
      ? await reqRepo.listarPorProyecto(proyectoId)
      : typeof reqRepo.obtenerPorProyecto === 'function'
        ? await reqRepo.obtenerPorProyecto(proyectoId)
        : [];

    if ((!requerimientos || requerimientos.length === 0) && requerimientosLocales) {
      if (Array.isArray(requerimientosLocales)) {
        requerimientos = requerimientosLocales;
      } else if (requerimientosLocales.functional || requerimientosLocales.nonFunctional) {
        requerimientos = [
          ...(requerimientosLocales.functional || []).map((r, i) => ({ ...r, tipo: 'RF', identificador: r.identificador || r.id || `RF-${String(i + 1).padStart(2, '0')}`, nombre: r.name || r.nombre })),
          ...(requerimientosLocales.nonFunctional || []).map((r, i) => ({ ...r, tipo: 'RNF', identificador: r.identificador || r.id || `RNF-${String(i + 1).padStart(2, '0')}`, nombre: r.category || r.nombre }))
        ];
      }
    }

    const diagRepo = this.diagramaRepository;
    const diagramas = typeof diagRepo.listarPorProyecto === 'function'
      ? await diagRepo.listarPorProyecto(proyectoId)
      : typeof diagRepo.obtenerPorProyecto === 'function'
        ? await diagRepo.obtenerPorProyecto(proyectoId)
        : [];

    const pantallasDerivadas = this._pantallasDelProyecto(diagramas).pantallas;
    const pantallasArbol = this._enriquecerPlataformas(pantallasDerivadas, requerimientos);
    const disenoExistente = await this.disenoRepository.obtenerPorProyecto(proyectoId);
    const sistemaDiseno = this._normalizarSistemaDiseno(disenoExistente?.sistema_diseno);
    const contextoProyecto = this._construirContexto(requerimientos, diagramas, proyecto, pantallasArbol, sistemaDiseno);

    const tamanoLote = GenerarMockups.TAMANO_LOTE;
    const lotes = this._dividirEnLotes(
      pantallas.length > 0 ? pantallas : pantallasArbol.map(p => p.slug),
      tamanoLote
    );

    const advertencias = [];
    const mockupsGenerados = [];
    let proveedorUsado = null;

    const totalPantallas = lotes.reduce((total, lote) => total + lote.length, 0);
    if (onProgress) await onProgress({ progreso: 5, mensaje: 'Contexto y árbol de navegación preparados' });

    if (lotes.length === 0) {
      const resultadoIa = await this.mockupIaService.generarMockups({
        contextoProyecto,
        pantallas,
        insumoAdicional
      });
      proveedorUsado = resultadoIa?.proveedorUsado || null;
      advertencias.push(...(resultadoIa?.advertencias || []));
      mockupsGenerados.push(...(resultadoIa?.mockups || []));
      if (onProgress) await onProgress({ progreso: 85, mensaje: 'Respuesta de IA recibida' });
    } else {
      for (let i = 0; i < lotes.length; i++) {
        const lote = lotes[i];
        const desde = i * tamanoLote + 1;
        const hasta = desde + lote.length - 1;
        const pantallasDelLote = pantallasArbol.filter(p => lote.includes(p.slug));
        const pantallaObjetivo = pantallasDelLote[0];
        const navegacionShell = pantallaObjetivo
          ? pantallasArbol.filter(p => p.shell === pantallaObjetivo.shell).map(p => p.nombre).join(' | ')
          : '';
        const contextoLote = this._construirContexto(
          requerimientos,
          diagramas,
          proyecto,
          pantallasDelLote.length > 0 ? pantallasDelLote : pantallasArbol,
          sistemaDiseno
        ) + (pantallaObjetivo ? `\n\nCONTRATO INMUTABLE DEL SHELL ${pantallaObjetivo.shell}:\nPlataforma: ${pantallaObjetivo.plataforma}. Roles: ${pantallaObjetivo.roles.join(', ')}. Opciones de navegación exactas y en este orden: ${navegacionShell}. Usa el nombre del proyecto como logo textual y el estado exacto "Sistema en línea".` : '');

        try {
          let resultadoIa = await this.mockupIaService.generarMockups({
            contextoProyecto: contextoLote,
            pantallas: lote,
            insumoAdicional: `${insumoAdicional}\n\nCONTEXTO DE ESTA EJECUCIÓN: lote ${i + 1} de ${lotes.length} del Árbol de Navegación (pantallas ${desde} a ${hasta} de ${totalPantallas}). Genera un mockup por cada pantalla de esta lista y solo por estas.`
          });

          const primerResultado = (resultadoIa?.mockups || [])[0];
          const validacionInicial = this.validator.validar(primerResultado?.preview_code);
          const nombreIncorrecto = primerResultado && primerResultado.nombre_pantalla !== lote[0];
          if (!primerResultado || !validacionInicial.valido || nombreIncorrecto) {
            const motivos = nombreIncorrecto
              ? `nombre_pantalla debe ser exactamente "${lote[0]}"`
              : (validacionInicial.errores.join('; ') || 'la IA no devolvió la pantalla solicitada');
            advertencias.push(`${lote[0]}: primer intento inválido (${motivos}); se realizó una reparación aislada`);
            resultadoIa = await this.mockupIaService.generarMockups({
              contextoProyecto: contextoLote,
              pantallas: lote,
              insumoAdicional: `${insumoAdicional}\nREPARACIÓN OBLIGATORIA: el intento anterior fue rechazado por: ${motivos}. Devuelve HTML completo, estilizado y autocontenido; no uses rutas locales ni imágenes rotas.`
            });
          }

          if (resultadoIa?.proveedorUsado) proveedorUsado = resultadoIa.proveedorUsado;
          advertencias.push(...(resultadoIa?.advertencias || []));
          mockupsGenerados.push(...(resultadoIa?.mockups || []));

          if (onProgress) {
            await onProgress({
              progreso: Math.max(10, Math.round(((i + 1) / lotes.length) * 85)),
              mensaje: `Lote ${i + 1} de ${lotes.length} procesado`
            });
          }

          if ((resultadoIa?.mockups || []).length < lote.length) {
            advertencias.push(`Lote ${i + 1}/${lotes.length}: la IA devolvió ${(resultadoIa?.mockups || []).length} de ${lote.length} pantallas`);
          }
        } catch (error) {
          advertencias.push(`Lote ${i + 1}/${lotes.length} falló: ${error.message}`);
        }
      }
    }

    const unicosPorNombre = new Map();
    for (const mockup of mockupsGenerados) {
      unicosPorNombre.set(mockup.nombre_pantalla, mockup);
    }

    const manifiestoPorSlug = new Map(pantallasArbol.map(p => [p.slug, p]));
    const mockupsSanitizados = [...unicosPorNombre.values()].map(mockup => {
      const sanitizado = this.validator.sanitizar(mockup.preview_code);
      const htmlConSistemaDiseno = this.validator.aplicarSistemaDiseno(sanitizado.html, sistemaDiseno);
      const validacion = this.validator.validar(htmlConSistemaDiseno);
      const pantalla = manifiestoPorSlug.get(mockup.nombre_pantalla);
      return {
        ...mockup,
        pantalla_id: pantalla?.pantalla_id || mockup.nombre_pantalla,
        nombre_visible: pantalla?.nombre || mockup.nombre_pantalla,
        flujo: pantalla?.flujo || 'General',
        modulo: pantalla?.modulo || 'General',
        ruta: pantalla?.ruta || '',
        plataforma: pantalla?.plataforma || 'web',
        roles: pantalla?.roles || ['Usuario'],
        shell: pantalla?.shell || 'web-general',
        preview_code: htmlConSistemaDiseno,
        advertencias_validacion: [...sanitizado.advertencias, ...validacion.advertencias],
        errores_validacion: validacion.errores,
        estado_calidad: validacion.estado,
        estado: 'generado',
        version: 1
      };
    });
    const mockupsExistentes = disenoExistente?.mockups || [];

    const mockupsFinales = this._mergeMockups(mockupsExistentes, mockupsSanitizados, pantallas);

    await this.disenoRepository.guardarOActualizar(proyectoId, {
      mockups: mockupsFinales,
      manifiesto_navegacion: pantallasArbol,
      sistema_diseno: sistemaDiseno
    });
    if (onProgress) await onProgress({ progreso: 95, mensaje: 'Mockups validados y almacenados' });

    return {
      mockups: mockupsFinales,
      totalProcesados: mockupsSanitizados.length,
      manifiesto: pantallasArbol,
      sistemaDiseno,
      proveedorUsado: proveedorUsado,
      advertencias: advertencias
    };
  }

  _pantallasDelProyecto(diagramas) {
    const arbolNav = (diagramas || []).find(d => d.tipo === 'arbol_navegacion' || d.tipo === 'navegacion' || d.tipo === 'wbs');
    if (!arbolNav) return { arbolNav: null, codigoArbol: '', pantallas: [] };

    const mermaid = arbolNav.codigo_mermaid;
    const mermaidUtil = typeof mermaid === 'string' && /^\s*\*+/m.test(mermaid) ? mermaid : '';

    const codigoArbol = arbolNav.codigo_plantuml || mermaidUtil || '';
    const pantallas = this._extraerPantallasDelArbol(codigoArbol);
    return { arbolNav, codigoArbol, pantallas };
  }

  _dividirEnLotes(lista, tamanoLote = GenerarMockups.TAMANO_LOTE) {
    if (lista.length === 0) return [];
    const lotes = [];
    for (let i = 0; i < lista.length; i += tamanoLote) {
      lotes.push(lista.slice(i, i + tamanoLote));
    }
    return lotes;
  }

  _construirContexto(requerimientos, diagramas, proyecto = {}, pantallasPrevias = null, sistemaDiseno = null) {
    const rfList = requerimientos
      .filter(r => (r.tipo || '').toUpperCase() === 'RF')
      .sort((a, b) => (a.prioridad === 'Alta' ? -1 : 0) - (b.prioridad === 'Alta' ? -1 : 0))
      .slice(0, GenerarMockups.MAX_RF_CONTEXTO)
      .map(r => `- [${r.identificador}] ${this._limitarTexto(r.nombre, 100)} (Prioridad: ${r.prioridad || 'Media'} | Actores: ${Array.isArray(r.actores) ? r.actores.join(', ') : (r.actores || 'Usuario')}): ${this._limitarTexto(r.descripcion, 320)}`)
      .join('\n');

    const rnfList = requerimientos
      .filter(r => (r.tipo || '').toUpperCase() === 'RNF')
      .slice(0, GenerarMockups.MAX_RNF_CONTEXTO)
      .map(r => `- [${r.identificador}] ${this._limitarTexto(r.nombre, 100)}: ${this._limitarTexto(r.metrica_medible || r.descripcion, 220)}`)
      .join('\n');

    const diagClases = diagramas.find(d => d.tipo === 'clases' || d.tipo === 'clases_dominio');
    const diagCasosUso = diagramas.find(d => d.tipo === 'casos_de_uso' || d.tipo === 'casos_uso');
    const diagArqui = diagramas.find(d => d.tipo === 'arquitectura_software' || d.tipo === 'arquitectura') || diagramas.find(d => d.tipo === 'arquitectura_sistema');
    const { pantallas: pantallasArbol } = this._pantallasDelProyecto(diagramas);

    const pantallas = pantallasPrevias || pantallasArbol;

    let seccionesDiagramas = '';
    if (diagArqui) {
      seccionesDiagramas += `\n\nARQUITECTURA (extracto):\n${this._limitarTexto(diagArqui.codigo_plantuml || diagArqui.codigo_mermaid || 'No disponible', 2000)}`;
    }
    if (diagClases) {
      seccionesDiagramas += `\n\nCLASES DEL DOMINIO (extracto):\n${this._limitarTexto(diagClases.codigo_plantuml || diagClases.codigo_mermaid || 'No disponible', 3500)}`;
    }
    if (diagCasosUso) {
      seccionesDiagramas += `\n\nCASOS DE USO (extracto):\n${this._limitarTexto(diagCasosUso.codigo_plantuml || diagCasosUso.codigo_mermaid || 'No disponible', 2500)}`;
    }

    const bloquePantallas = pantallas.length > 0
      ? this._construirBloquePantallas(pantallas)
      : `No se pudo derivar el listado de pantallas del Árbol de Navegación. En este caso, deriva las pantallas de los Requerimientos Funcionales de prioridad Alta, empezando por las de acceso y el panel principal.`;

    const diseno = this._normalizarSistemaDiseno(sistemaDiseno);
    return `SISTEMA / PROYECTO: "${proyecto.nombre || 'Sistema de Información'}"
DESCRIPCIÓN DEL NEGOCIO: ${this._limitarTexto(proyecto.descripcion || 'Sin descripción', 500)}

SISTEMA VISUAL OBLIGATORIO (idéntico en todas las pantallas):
- Color primario: ${diseno.colores.primario}; primario oscuro: ${diseno.colores.primario_oscuro}
- Fondo: ${diseno.colores.fondo}; superficie: ${diseno.colores.superficie}; texto: ${diseno.colores.texto}
- Éxito: ${diseno.colores.exito}; alerta: ${diseno.colores.alerta}; error: ${diseno.colores.error}
- Usa exactamente el mismo nombre/logo textual, navegación y mensaje de estado dentro de cada shell.

ÁRBOL DE NAVEGACIÓN (FUENTE PRINCIPAL DE LOS MOCKUPS):
${bloquePantallas}

REQUERIMIENTOS FUNCIONALES (ISO/IEC/IEEE 29148:2018):
${rfList || 'Sin requerimientos funcionales'}

REQUERIMIENTOS NO FUNCIONALES:
${rnfList || 'Sin requerimientos no funcionales'}

REGLA DE PRIORIDAD: el listado de PANTALLAS A DISEÑAR manda sobre los requerimientos. Los Requerimientos Funcionales y No Funcionales NO agregan ni quitan pantallas: solo aportan los nombres de los campos, sus tipos, formatos, validaciones y métricas que cada pantalla ya definida debe reflejar.
${seccionesDiagramas}`;
  }

  _limitarTexto(valor, maximo) {
    const texto = String(valor || '').replace(/\s+/g, ' ').trim();
    return texto.length > maximo ? `${texto.slice(0, maximo)}…` : texto;
  }

  _construirBloquePantallas(pantallas) {
    const listado = pantallas
      .map((p, i) => {
        const componentes = p.componentes && p.componentes.length > 0
          ? ` | componentes que DEBEN aparecer dentro de esta misma pantalla: ${p.componentes.join(', ')}`
          : '';
        return `${i + 1}. ${p.nombre} | tipo: ${p.tipo} | flujo: ${p.flujo} | módulo: ${p.modulo} | plataforma: ${p.plataforma} | roles: ${p.roles.join(', ')} | shell: ${p.shell} | ruta: ${p.ruta}${componentes} | slug sugerido: ${p.slug}`;
      })
      .join('\n');

    return `PANTALLAS A DISEÑAR (derivadas del Árbol de Navegación):
Genera EXCLUSIVAMENTE mockups para las siguientes pantallas, en este orden de prioridad. No inventes pantallas que no estén en esta lista.

${listado}

REGLAS DE GENERACIÓN BASADA EN EL ÁRBOL:
- Un mockup por cada pantalla listada, empezando por las de acceso y el panel principal, y respetando el orden numérico.
- El nombre_pantalla de cada mockup debe ser el slug sugerido.
- Cada mockup debe incluir en su primera viñeta de descripcion_jerarquica la ruta completa de la pantalla con el formato "Ruta: <ruta> | Módulo: <módulo>".
- Respeta la plataforma indicada. mobile usa viewport de 390px y navegación móvil; tablet usa 768-1024px y controles táctiles; web usa escritorio.
- Todas las pantallas con el mismo shell deben repetir exactamente logo/nombre, navegación, colores, usuario y texto de estado. No agregues opciones diferentes entre pantallas hermanas.
- Los campos, tablas y filtros de cada pantalla se toman del Diagrama de Clases y de los Requerimientos Funcionales asociados a esa pantalla concreta.
- Si una pantalla indica "componentes que DEBEN aparecer dentro de esta misma pantalla", esos elementos (botones, campos, indicadores, teclados, etc.) son PARTE de esa pantalla: dibújalos dentro del mismo mockup, nunca como pantallas aparte.
- Si una pantalla es un listado, la tabla debe mostrar las entidades del módulo. Si es un formulario, los inputs deben ser los atributos de la entidad. Si es un detalle, debe resumir la entidad con sus estados.`;
  }

  _limpiarNombreNodo(texto) {
    const nombre = texto
      .replace(/^\d+(?:[.)]\s*\d+)*[.)]?\s+/, '')
      // Conservar la plataforma porque forma parte del contrato de navegación.
      .replace(/\s*\((?!m[oó]vil|mobile|tablet|web)[^)]*\)\s*$/i, '')
      .trim();
    return /[\p{L}\p{N}]/u.test(nombre) ? nombre : '';
  }

  _esComponenteUi(nombre) {
    const n = nombre.toLowerCase().trim();

    // \b de JavaScript solo reconoce caracteres ASCII como palabra, por lo que
    // "Catálogo" cumpliría \blogo\b. Por eso se comparan prefijos y no límites \b.

    // Términos que solo cuentan si encabezan el nombre del nodo.
    const prefijos = [
      'botón', 'botones', 'teclado', 'keypad', 'display', 'indicador', 'campo', 'input',
      'select', 'buscador', 'logo', 'logotipo', 'modal', 'diálogo', 'switch', 'toggle',
      'interruptor', 'avatar', 'badge', 'chip', 'pill', 'slider', 'stepper', 'wizard',
      'asistente', 'combobox', 'dropdown', 'desplegable', 'checkbox', 'casilla', 'radio',
      'toast', 'spinner', 'loader', 'icono', 'iconos'
    ];

    // Términos inequívocos que pueden aparecer en cualquier parte del nombre.
    const enCualquierPosicion = ['toast', 'tooltip', 'spinner', 'avatar', 'checkbox', 'combobox', 'dropdown'];

    const empiezaPor = prefijos.some(p => n.startsWith(`${p} `) || n === p);
    if (empiezaPor) return true;

    return enCualquierPosicion.some(p => n.includes(p));
  }

  _extraerPantallasDelArbol(codigo) {
    if (!codigo || typeof codigo !== 'string') return [];

    const nodos = [];
    let nombreSistema = '';

    codigo.split('\n').forEach((linea) => {
      const match = linea.match(/^(\*+)\s*(.+?)\s*$/);
      if (!match) return;

      const nivel = match[1].length;
      const nombre = this._limpiarNombreNodo(match[2]);
      if (!nombre) return;

      if (nivel === 1) {
        nombreSistema = nombre;
        return;
      }

      nodos.push({ nivel, nombre });
    });

    if (nodos.length === 0) return [];

    const raiz = { nivel: 1, nombre: nombreSistema, hijos: [] };
    const pila = [raiz];

    for (const nodo of nodos) {
      while (pila.length > 1 && pila[pila.length - 1].nivel >= nodo.nivel) {
        pila.pop();
      }
      const padre = pila[pila.length - 1];
      const hijo = { nivel: nodo.nivel, nombre: nodo.nombre, hijos: [] };
      padre.hijos.push(hijo);
      pila.push(hijo);
    }

    const pantallas = [];
    const slugsUsados = new Set();

    const visitar = (nodo, ruta, modulos) => {
      // Los componentes se recogen primero para poder adjuntarlos a las pantallas hermanas,
      // pero el registro se hace en el orden original del árbol.
      const componentes = nodo.hijos
        .filter(h => h.hijos.length === 0 && this._esComponenteUi(h.nombre))
        .map(h => h.nombre);

      const soloComponentes = componentes.length === nodo.hijos.length;

      if (soloComponentes) {
        this._registrarPantalla(nodo.nombre, nombreSistema, [...ruta, nodo.nombre], modulos, componentes, pantallas, slugsUsados);
        return;
      }

      for (const hijo of nodo.hijos) {
        if (hijo.hijos.length > 0) {
          visitar(hijo, [...ruta, nodo.nombre], [...modulos, hijo.nombre]);
        } else if (!this._esComponenteUi(hijo.nombre)) {
          this._registrarPantalla(hijo.nombre, nombreSistema, [...ruta, nodo.nombre, hijo.nombre], modulos, componentes, pantallas, slugsUsados);
        }
      }
    };

    visitar(raiz, [], []);

    return pantallas;
  }

  _registrarPantalla(nombre, nombreSistema, partesRuta, modulos, componentes, pantallas, slugsUsados) {
    const ruta = [nombreSistema, ...partesRuta]
      .filter(Boolean)
      .filter((valor, i, arr) => arr.indexOf(valor) === i);

    const modulo = modulos.length > 0 ? modulos[modulos.length - 1] : (nombreSistema || nombre);
    let slug = this._generarSlugPantalla(nombre) || `pantalla-${pantallas.length + 1}`;

    if (slugsUsados.has(slug)) {
      const conModulo = this._generarSlugPantalla(`${modulo} ${nombre}`);
      slug = conModulo && !slugsUsados.has(conModulo) ? conModulo : `${slug}-${pantallas.length + 1}`;
    }
    slugsUsados.add(slug);

    pantallas.push({
      pantalla_id: slug,
      nombre,
      ruta: ruta.join(' / '),
      modulo,
      flujo: this._inferirFlujo(ruta, modulo),
      tipo: this._inferirTipoPantalla(nombre),
      plataforma: this._inferirPlataforma(ruta),
      roles: this._inferirRoles(ruta),
      shell: this._inferirShell(ruta),
      componentes,
      slug,
      orden: pantallas.length + 1,
      obligatoria: true
    });
  }

  _textoRuta(ruta) {
    return (Array.isArray(ruta) ? ruta.join(' ') : String(ruta || '')).normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  _inferirPlataforma(ruta) {
    const texto = this._textoRuta(ruta);
    if (/cliente|comensal|movil|mobile/.test(texto)) return 'mobile';
    if (/mesero|camarero|salon|tablet/.test(texto)) return 'tablet';
    return 'web';
  }

  _inferirRoles(ruta) {
    const texto = this._textoRuta(ruta);
    const roles = [];
    if (/cliente|comensal/.test(texto)) roles.push('Cliente');
    if (/mesero|camarero|salon/.test(texto)) roles.push('Mesero');
    if (/cocina|kds|chef/.test(texto)) roles.push('Personal de Cocina');
    if (/caja|cajero|cobro|pago/.test(texto)) roles.push('Cajero');
    if (/admin|configuracion|usuarios|roles|reportes/.test(texto)) roles.push('Administrador');
    return roles.length ? [...new Set(roles)] : ['Usuario'];
  }

  _inferirShell(ruta) {
    const plataforma = this._inferirPlataforma(ruta);
    const texto = this._textoRuta(ruta);
    if (/acceso|sesion|contrasena|registro/.test(texto)) return `auth-${plataforma}`;
    if (/cocina|kds/.test(texto)) return 'kds-web';
    if (/admin|configuracion|usuarios|roles|reportes/.test(texto)) return 'admin-web';
    if (plataforma === 'mobile') return 'cliente-mobile';
    if (plataforma === 'tablet') return 'mesero-tablet';
    return 'operaciones-web';
  }

  _inferirFlujo(ruta, modulo) {
    const partes = Array.isArray(ruta) ? ruta.filter(Boolean) : [];
    return partes.length > 1 ? partes[1] : (modulo || 'General');
  }

  _enriquecerPlataformas(pantallas, requerimientos = []) {
    const textoRequisitos = (requerimientos || []).map(r => [r.nombre, r.descripcion, r.actores].flat().join(' ')).join(' ');
    const normalizado = this._textoRuta(textoRequisitos);
    const hayCliente = /cliente|comensal/.test(normalizado);
    const hayMesero = /mesero|camarero|personal de salon/.test(normalizado);

    return (pantallas || []).map(pantalla => {
      const texto = this._textoRuta(`${pantalla.ruta} ${pantalla.nombre}`);
      let plataforma = pantalla.plataforma;
      let roles = pantalla.roles;
      let shell = pantalla.shell;

      if (hayCliente && plataforma === 'web' && /menu digital|reserva|mis pedidos|mis puntos|paquete prepagado/.test(texto) && !/gestion|administracion/.test(texto)) {
        plataforma = 'mobile'; roles = ['Cliente']; shell = 'cliente-mobile';
      } else if (hayMesero && plataforma === 'web' && /mesa|nueva comanda|nuevo pedido|listado de comandas|listado de pedidos/.test(texto) && !/cocina|kds|caja/.test(texto)) {
        plataforma = 'tablet'; roles = ['Mesero']; shell = 'mesero-tablet';
      }

      return { ...pantalla, plataforma, roles, shell };
    });
  }

  _normalizarSistemaDiseno(sistema = null) {
    const colores = sistema?.colores || {};
    return {
      nombre: sistema?.nombre || 'Predeterminado I-CASE',
      origen: sistema?.origen || 'predeterminado',
      version: sistema?.version || 1,
      colores: {
        primario: colores.primario || '#0b57d0',
        primario_oscuro: colores.primario_oscuro || '#073d8c',
        secundario: colores.secundario || '#64748b',
        fondo: colores.fondo || '#f8fafc',
        superficie: colores.superficie || '#ffffff',
        texto: colores.texto || '#0f172a',
        exito: colores.exito || '#059669',
        alerta: colores.alerta || '#d97706',
        error: colores.error || '#dc2626'
      }
    };
  }

  async obtenerCatalogo(proyectoId) {
    const diagramas = typeof this.diagramaRepository.listarPorProyecto === 'function'
      ? await this.diagramaRepository.listarPorProyecto(proyectoId)
      : await this.diagramaRepository.obtenerPorProyecto(proyectoId);
    const diseno = await this.disenoRepository.obtenerPorProyecto(proyectoId);
    const requerimientos = typeof this.requerimientoRepository.listarPorProyecto === 'function'
      ? await this.requerimientoRepository.listarPorProyecto(proyectoId)
      : await this.requerimientoRepository.obtenerPorProyecto(proyectoId);
    const derivadas = this._enriquecerPlataformas(this._pantallasDelProyecto(diagramas || []).pantallas, requerimientos || []);
    const manifiesto = derivadas.length ? derivadas : (diseno?.manifiesto_navegacion || []);
    return {
      mockups: diseno?.mockups || [],
      manifiesto,
      sistemaDiseno: this._normalizarSistemaDiseno(diseno?.sistema_diseno)
    };
  }

  async sugerirSistemaDiseno(proyectoId) {
    const proyecto = await this.proyectoRepository.obtenerPorId(proyectoId);
    if (!proyecto) throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
    return this.mockupIaService.sugerirPaleta({
      nombreProyecto: proyecto.nombre || 'Sistema de información',
      descripcion: proyecto.descripcion || ''
    });
  }

  _inferirTipoPantalla(nombre) {
    const n = nombre.toLowerCase();

    if (/sesi[oó]n|recuperaci[oó]n|registro de usuario/.test(n)) return 'form';
    if (/formulario|nuevo|alta|crear|registro de/.test(n)) return 'form';
    if (/detalle/.test(n)) return 'detail';
    if (/m[eé]trica|dashboard|tablero|panel/.test(n)) return 'dashboard';
    if (/listado|gesti[oó]n|administraci[oó]n|usuarios|roles|permisos|configuraci[oó]n|perfil/.test(n)) return 'list';
    return 'list';
  }

  _generarSlugPantalla(nombre) {
    return nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  _mergeMockups(existentes, nuevos, pantallasSolicitadas) {
    const mapaExistentes = new Map(existentes.map(m => [m.nombre_pantalla, m]));
    const resultado = [];

    for (const nuevo of nuevos) {
      const existente = mapaExistentes.get(nuevo.nombre_pantalla);
      const sePidioExplicitamente = pantallasSolicitadas.includes(nuevo.nombre_pantalla);

      if (existente && existente.estado === 'editado' && !sePidioExplicitamente) {
        resultado.push(existente);
      } else {
        resultado.push({
          ...nuevo,
          version: existente ? existente.version + 1 : 1
        });
      }
      mapaExistentes.delete(nuevo.nombre_pantalla);
    }

    for (const [, existente] of mapaExistentes) {
      resultado.push(existente);
    }

    return resultado;
  }
}

GenerarMockups.TAMANO_LOTE = 1;
GenerarMockups.MAX_RF_CONTEXTO = 20;
GenerarMockups.MAX_RNF_CONTEXTO = 8;

module.exports = GenerarMockups;
