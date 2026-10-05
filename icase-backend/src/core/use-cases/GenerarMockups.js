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

  async ejecutar({ proyectoId, pantallas = [], insumoAdicional = '', requerimientosLocales = null }) {
    const proyecto = await this.proyectoRepository.obtenerPorId(proyectoId);
    if (!proyecto) {
      throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
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

    const { pantallas: pantallasArbol } = this._pantallasDelProyecto(diagramas);
    const contextoProyecto = this._construirContexto(requerimientos, diagramas, proyecto, pantallasArbol);

    const tamanoLote = GenerarMockups.TAMANO_LOTE;
    const lotes = this._dividirEnLotes(
      pantallas.length > 0 ? pantallas : pantallasArbol.map(p => p.slug),
      tamanoLote
    );

    const advertencias = [];
    const mockupsGenerados = [];
    let proveedorUsado = null;

    const totalPantallas = lotes.reduce((total, lote) => total + lote.length, 0);

    if (lotes.length === 0) {
      const resultadoIa = await this.mockupIaService.generarMockups({
        contextoProyecto,
        pantallas,
        insumoAdicional
      });
      proveedorUsado = resultadoIa?.proveedorUsado || null;
      advertencias.push(...(resultadoIa?.advertencias || []));
      mockupsGenerados.push(...(resultadoIa?.mockups || []));
    } else {
      for (let i = 0; i < lotes.length; i++) {
        const lote = lotes[i];
        const desde = i * tamanoLote + 1;
        const hasta = desde + lote.length - 1;

        try {
          const resultadoIa = await this.mockupIaService.generarMockups({
            contextoProyecto,
            pantallas: lote,
            insumoAdicional: `${insumoAdicional}\n\nCONTEXTO DE ESTA EJECUCIÓN: lote ${i + 1} de ${lotes.length} del Árbol de Navegación (pantallas ${desde} a ${hasta} de ${totalPantallas}). Genera un mockup por cada pantalla de esta lista y solo por estas.`
          });

          if (resultadoIa?.proveedorUsado) proveedorUsado = resultadoIa.proveedorUsado;
          advertencias.push(...(resultadoIa?.advertencias || []));
          mockupsGenerados.push(...(resultadoIa?.mockups || []));

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

    const mockupsSanitizados = [...unicosPorNombre.values()].map(mockup => {
      const sanitizado = this.validator.sanitizar(mockup.preview_code);
      return {
        ...mockup,
        preview_code: sanitizado.html,
        advertencias_validacion: sanitizado.advertencias,
        estado: 'generado',
        version: 1
      };
    });

    const disenoExistente = await this.disenoRepository.obtenerPorProyecto(proyectoId);
    const mockupsExistentes = disenoExistente?.mockups || [];

    const mockupsFinales = this._mergeMockups(mockupsExistentes, mockupsSanitizados, pantallas);

    await this.disenoRepository.guardarOActualizar(proyectoId, { mockups: mockupsFinales });

    return {
      mockups: mockupsFinales,
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

  _construirContexto(requerimientos, diagramas, proyecto = {}, pantallasPrevias = null) {
    const rfList = requerimientos
      .filter(r => (r.tipo || '').toUpperCase() === 'RF')
      .map(r => `- [${r.identificador}] ${r.nombre} (Prioridad: ${r.prioridad || 'Media'} | Actores: ${Array.isArray(r.actores) ? r.actores.join(', ') : (r.actores || 'Usuario')}): ${r.descripcion}`)
      .join('\n');

    const rnfList = requerimientos
      .filter(r => (r.tipo || '').toUpperCase() === 'RNF')
      .map(r => `- [${r.identificador}] ${r.nombre}: ${r.metrica_medible || r.descripcion}`)
      .join('\n');

    const diagClases = diagramas.find(d => d.tipo === 'clases' || d.tipo === 'clases_dominio');
    const diagCasosUso = diagramas.find(d => d.tipo === 'casos_de_uso' || d.tipo === 'casos_uso');
    const { arbolNav, codigoArbol, pantallas: pantallasArbol } = this._pantallasDelProyecto(diagramas);
    const diagArqui = diagramas.find(d => d.tipo === 'arquitectura');

    const pantallas = pantallasPrevias || pantallasArbol;

    let seccionesDiagramas = '';
    if (arbolNav) {
      seccionesDiagramas += `\n\nÁRBOL DE NAVEGACIÓN (PANTALLAS Y RUTAS):\n${codigoArbol || 'No disponible'}`;
    }
    if (diagClases) {
      seccionesDiagramas += `\n\nDIAGRAMA DE CLASES DEL DOMINIO (ENTIDADES Y ATRIBUTOS TIPADOS OBLIGATORIOS PARA FORMULARIOS Y TABLAS):\n${diagClases.codigo_plantuml || diagClases.codigo_mermaid || 'No disponible'}`;
    }
    if (diagCasosUso) {
      seccionesDiagramas += `\n\nDIAGRAMA DE CASOS DE USO (ACTORES Y PROCESOS CLAVE):\n${diagCasosUso.codigo_plantuml || diagCasosUso.codigo_mermaid || 'No disponible'}`;
    }
    if (diagArqui) {
      seccionesDiagramas += `\n\nARQUITECTURA DEL SISTEMA:\n${diagArqui.codigo_plantuml || diagArqui.codigo_mermaid || 'No disponible'}`;
    }

    const bloquePantallas = pantallas.length > 0
      ? this._construirBloquePantallas(pantallas)
      : `No se pudo derivar el listado de pantallas del Árbol de Navegación. En este caso, deriva las pantallas de los Requerimientos Funcionales de prioridad Alta, empezando por las de acceso y el panel principal.`;

    return `SISTEMA / PROYECTO: "${proyecto.nombre || 'Sistema de Información'}"
DESCRIPCIÓN DEL NEGOCIO: ${proyecto.descripcion || 'Sin descripción'}

ÁRBOL DE NAVEGACIÓN (FUENTE PRINCIPAL DE LOS MOCKUPS):
${bloquePantallas}

REQUERIMIENTOS FUNCIONALES (ISO/IEC/IEEE 29148:2018):
${rfList || 'Sin requerimientos funcionales'}

REQUERIMIENTOS NO FUNCIONALES:
${rnfList || 'Sin requerimientos no funcionales'}

REGLA DE PRIORIDAD: el listado de PANTALLAS A DISEÑAR manda sobre los requerimientos. Los Requerimientos Funcionales y No Funcionales NO agregan ni quitan pantallas: solo aportan los nombres de los campos, sus tipos, formatos, validaciones y métricas que cada pantalla ya definida debe reflejar.
${seccionesDiagramas}`;
  }

  _construirBloquePantallas(pantallas) {
    const listado = pantallas
      .map((p, i) => {
        const componentes = p.componentes && p.componentes.length > 0
          ? ` | componentes que DEBEN aparecer dentro de esta misma pantalla: ${p.componentes.join(', ')}`
          : '';
        return `${i + 1}. ${p.nombre} | tipo: ${p.tipo} | ruta: ${p.ruta}${componentes} | slug sugerido: ${p.slug}`;
      })
      .join('\n');

    return `PANTALLAS A DISEÑAR (derivadas del Árbol de Navegación):
Genera EXCLUSIVAMENTE mockups para las siguientes pantallas, en este orden de prioridad. No inventes pantallas que no estén en esta lista.

${listado}

REGLAS DE GENERACIÓN BASADA EN EL ÁRBOL:
- Un mockup por cada pantalla listada, empezando por las de acceso y el panel principal, y respetando el orden numérico.
- El nombre_pantalla de cada mockup debe ser el slug sugerido.
- Cada mockup debe incluir en su primera viñeta de descripcion_jerarquica la ruta completa de la pantalla con el formato "Ruta: <ruta> | Módulo: <módulo>".
- Los campos, tablas y filtros de cada pantalla se toman del Diagrama de Clases y de los Requerimientos Funcionales asociados a esa pantalla concreta.
- Si una pantalla indica "componentes que DEBEN aparecer dentro de esta misma pantalla", esos elementos (botones, campos, indicadores, teclados, etc.) son PARTE de esa pantalla: dibújalos dentro del mismo mockup, nunca como pantallas aparte.
- Si una pantalla es un listado, la tabla debe mostrar las entidades del módulo. Si es un formulario, los inputs deben ser los atributos de la entidad. Si es un detalle, debe resumir la entidad con sus estados.`;
  }

  _limpiarNombreNodo(texto) {
    const nombre = texto
      .replace(/^\d+(?:[.)]\s*\d+)*[.)]?\s+/, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
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
      nombre,
      ruta: ruta.join(' / '),
      modulo,
      tipo: this._inferirTipoPantalla(nombre),
      componentes,
      slug
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

GenerarMockups.TAMANO_LOTE = 4;

module.exports = GenerarMockups;