const MockupFunctionalCoverageService = require('./MockupFunctionalCoverageService');

const STOPWORDS = new Set([
  'accion', 'actualizar', 'administrar', 'aplicacion', 'crear', 'debe', 'digital',
  'el', 'en', 'gestionar', 'gestion', 'la', 'las', 'los', 'mostrar', 'nuevo',
  'para', 'permitir', 'procesar', 'realizar', 'registrar', 'sistema', 'una',
  'usuario', 'validar', 'ver', 'consultar', 'consulta', 'pantalla', 'vista',
  'formulario', 'detalle', 'informacion', 'datos', 'cliente', 'personal',
  'acceso', 'principal', 'modulo', 'flujo', 'interfaz', 'estado', 'por',
  'del', 'con', 'sin', 'sus', 'que', 'como', 'mediante', 'cada',
  'visualizacion', 'validacion', 'procesamiento', 'marcado', 'acumulacion'
]);

const SYNONYMS = new Map([
  ['cobrar', 'pago'], ['cobro', 'pago'], ['pagar', 'pago'],
  ['comanda', 'pedido'], ['orden', 'pedido'],
  ['reservacion', 'reserva'], ['reservar', 'reserva'],
  ['reporte', 'informe'], ['report', 'informe'],
  ['platillo', 'plato'], ['prepagado', 'paquete'], ['prepago', 'paquete'],
  ['pts', 'punto'], ['puntos', 'punto'],
  ['login', 'autenticacion'], ['sesion', 'autenticacion'], ['sesiones', 'autenticacion'],
  ['credencial', 'autenticacion'], ['credenciales', 'autenticacion'],
  ['disponible', 'disponibilidad'], ['agotado', 'disponibilidad']
]);

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function stem(value) {
  let token = value;
  if (token.length > 6 && token.endsWith('es')) token = token.slice(0, -2);
  else if (token.length > 4 && token.endsWith('s')) token = token.slice(0, -1);
  return SYNONYMS.get(token) || token;
}

function tokens(value) {
  return [...new Set(normalize(String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map(stem)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token)))];
}

function requirementId(requirement) {
  return String(requirement?.identificador || requirement?.id || '').trim().toUpperCase();
}

function requirementText(requirement) {
  return [requirement?.nombre, requirement?.descripcion].filter(Boolean).join(' ');
}

function localHtmlText(html) {
  const source = String(html || '');
  const main = source.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i);
  const clean = (main ? main[1] : source)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  // Un header dentro de main identifica la pantalla, no el shell global.
  const local = main ? clean : clean.replace(/<header\b[^>]*>[\s\S]*?<\/header\s*>/gi, ' ');
  return local.replace(/<[^>]+>/g, ' ')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, value) => {
      const code = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value);
      return code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&(?:nbsp|amp|quot|lt|gt);/gi, ' ');
}

function pageHeadingText(html) {
  const clean = String(html || '').replace(/<(script|style|nav|aside|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  return [...clean.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(match => localHtmlText(match[1])).join(' ');
}

function screenText(screen) {
  // Con HTML disponible solo cuenta el contenido local, no etiquetas de la IA,
  // nombres de módulos, rutas ancestras, clases CSS o enlaces del shell común.
  if (screen?.preview_code) return localHtmlText(screen.preview_code) + ' ' + pageHeadingText(screen.preview_code);
  return [
    screen?.nombre, screen?.nombre_visible, screen?.nombre_pantalla,
    screen?.componentes, screen?.elementos_visibles,
    screen?.acciones_principales, screen?.campos_formulario?.map((field) => field?.nombre),
  ].flat(Infinity).filter(Boolean).join(' ');
}

function hasSemanticEvidence(requirement, screen) {
  const titleExpected = tokens(requirement?.nombre);
  const fullExpected = tokens(requirementText(requirement));
  const local = screenText(screen);
  const actual = new Set(tokens(local));
  if (screen?.preview_code) {
    const source = String(screen.preview_code);
    const main = source.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i);
    const html = (main ? main[1] : source.replace(/<header\b[^>]*>[\s\S]*?<\/header\s*>/gi, ' '))
      .replace(/<(script|style|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
    const headings = [...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
      .map(match => localHtmlText(match[1])).join(' ');
    const screenTitle = [screen?.nombre, screen?.nombre_visible, screen?.nombre_pantalla, screen?.slug]
      .filter(Boolean).map(s => String(s).replace(/[-_]/g, ' ')).join(' ');
    const scope = new Set(tokens(headings + ' ' + pageHeadingText(source) + ' ' + screenTitle));
    if (scope.size && !fullExpected.some(token => scope.has(token))) return false;
    const intent = normalize(requirement?.nombre);
    if (/^(validacion|validar)\b/.test(intent) && !/\bvalid(ar|acion|ado|ada)\b/.test(normalize(local))) return false;
    if (/^(marcado|marcar)\b/.test(intent) && !/\bmarc(ar|ado|ada)\b/.test(normalize(local))) return false;
  }
  const titleMatches = titleExpected.filter(token => actual.has(token));
  if (titleMatches.length > 0 && (titleMatches.length >= 2 || titleMatches.length / titleExpected.length >= 0.5)) {
    return true;
  }
  const matches = fullExpected.filter(token => actual.has(token));
  if (matches.includes('autenticacion') && /inicio.*sesion|login|autentic/i.test(screen?.slug || screen?.nombre || screen?.nombre_pantalla || '')) {
    return true;
  }
  return matches.length > 0 && (matches.length >= 2 || matches.length / fullExpected.length >= 0.5);
}

function isHighPriority(requirement) {
  return normalize(requirement?.prioridad).includes('alta');
}

function hasHumanActor(requirement) {
  const actors = (Array.isArray(requirement?.actores) ? requirement.actores : [requirement?.actores])
    .flatMap((actor) => String(actor || '').split(/[,;|]/))
    .map(normalize)
    .filter(Boolean);
  return actors.length === 0 || actors.some((actor) => !/^(sistema|servicio|api|base de datos|proceso automatico)$/.test(actor));
}

function humanActors(requirement) {
  return (Array.isArray(requirement?.actores) ? requirement.actores : [requirement?.actores])
    .flatMap((actor) => String(actor || '').split(/[,;|]/))
    .map((actor) => actor.trim())
    .filter((actor) => actor && !/^(sistema|servicio|api|base de datos|proceso autom[aá]tico)$/i.test(actor));
}

function expectedUiEvidence(requirement) {
  const text = normalize(requirementText(requirement));
  return {
    roles: humanActors(requirement),
    fields: /\b(registrar|crear|editar|actualizar|ingresar|capturar|formulario|reservar|pagar|cobrar|autenticar|iniciar sesion|escanear)\b/.test(text),
    actions: /\b(consultar|mostrar|registrar|crear|editar|actualizar|eliminar|reservar|comprar|pagar|cobrar|validar|marcar|gestionar|generar|escanear|ver)\b/.test(text),
    states: /\b(estado|disponible|disponibilidad|agotado|pendiente|aprobado|rechazado|confirmado|cancelado|en tiempo real|seguimiento)\b/.test(text)
  };
}

function uiEvidence(mockups, expected) {
  const joined = mockups.map(screenText).join(' ');
  const normalized = normalize(joined);
  const roles = new Set(mockups.flatMap((mockup) => Array.isArray(mockup?.roles) ? mockup.roles : []).map(normalize));
  return {
    roles: expected.roles.length === 0 || expected.roles.some((actor) => {
      const normalizedActor = normalize(actor);
      return roles.has(normalizedActor) || [...roles].some(role => role.endsWith(' de ' + normalizedActor)) || normalized.includes(normalizedActor);
    }),
    fields: !expected.fields || mockups.some((mockup) =>
      (Array.isArray(mockup?.campos_formulario) && mockup.campos_formulario.length > 0) ||
      /<(?:input|select|textarea)\b/i.test(mockup?.preview_code || '')
    ),
    actions: !expected.actions || mockups.some((mockup) =>
      (Array.isArray(mockup?.acciones_principales) && mockup.acciones_principales.length > 0) ||
      /<(?:button|a)\b/i.test(mockup?.preview_code || '')
    ),
    states: !expected.states || /\b(estado|disponible|agotado|pendiente|aprobado|rechazado|confirmado|cancelado|preparacion|listo|activo|inactivo)s?\b/.test(normalized)
  };
}

class MockupTraceabilityService {
  constructor() {
    this.functionalCoverage = new MockupFunctionalCoverageService();
  }

  buildManifest(screens = [], requirements = []) {
    const functional = this.functionalRequirements(requirements);
    return (Array.isArray(screens) ? screens : []).map((screen) => ({
      ...screen,
      rf_trazabilidad: functional
        .filter((requirement) => hasSemanticEvidence(requirement, screen))
        .map(requirementId)
        .filter(Boolean)
    }));
  }

  enrichMockup(mockup, screen, requirements = []) {
    const functional = this.functionalRequirements(requirements);
    const inferred = functional
      .filter((requirement) => hasSemanticEvidence(requirement, { ...screen, ...mockup }))
      .map(requirementId);
    // Declarar un ID o heredarlo del árbol no demuestra cobertura.
    return [...new Set(inferred.filter(Boolean))];
  }

  enrichAll(mockups = [], manifest = [], requirements = []) {
    const screenMap = new Map((Array.isArray(manifest) ? manifest : []).flatMap((screen) => [
      [screen.pantalla_id, screen],
      [screen.slug, screen]
    ]).filter(([id]) => id));
    return (Array.isArray(mockups) ? mockups : []).map((mockup) => {
      const screen = screenMap.get(mockup.pantalla_id) || screenMap.get(mockup.nombre_pantalla);
      return {
        ...mockup,
        rf_trazabilidad: this.enrichMockup(mockup, screen, requirements)
      };
    });
  }

  validate({ manifest = [], mockups = [], requirements = [], requireComplete = false } = {}) {
    const errors = [];
    const warnings = [];
    const screens = Array.isArray(manifest) ? manifest : [];
    let generated = Array.isArray(mockups) ? mockups : [];
    const functional = this.functionalRequirements(requirements);

    if (screens.length && generated.length === 0 && !requireComplete) {
      return {
        valido: true,
        estado: 'pendiente',
        completo: false,
        errores: [],
        advertencias: ['Los mockups aún no se han generado; la cobertura se validará al aprobarlos o exportar el documento.'],
        metricas: { pantallas_arbol: screens.length, mockups_generados: 0, pantallas_pendientes: screens.length },
        validado_en: new Date()
      };
    }

    if (!screens.length) {
      return {
        valido: true,
        errores: [],
        advertencias: ['No existe un manifiesto de navegación; la trazabilidad de mockups no pudo comprobarse.'],
        metricas: { pantallas_arbol: 0, mockups_generados: generated.length }
      };
    }

    const screenIds = new Set(screens.flatMap((screen) => [screen.pantalla_id, screen.slug]).filter(Boolean));
    const mockupIds = new Set(generated.flatMap((mockup) => [mockup.pantalla_id, mockup.nombre_pantalla]).filter(Boolean));
    const missingScreens = screens
      .filter((screen) => screen.obligatoria !== false && ![screen.pantalla_id, screen.slug].some((id) => mockupIds.has(id)))
      .map((screen) => screen.nombre || screen.slug || screen.pantalla_id);
    const orphanMockups = generated
      .filter((mockup) => ![mockup.pantalla_id, mockup.nombre_pantalla].some((id) => screenIds.has(id)))
      .map((mockup) => mockup.nombre_visible || mockup.nombre_pantalla || mockup.pantalla_id);

    if (missingScreens.length) {
      const message = `Faltan mockups para pantallas obligatorias del árbol: ${missingScreens.join(', ')}.`;
      errors.push(message);
    }
    if (orphanMockups.length) errors.push(`Existen mockups que no pertenecen al árbol aprobado: ${orphanMockups.join(', ')}.`);

    const traceIds = new Set(generated.flatMap((mockup) => Array.isArray(mockup.rf_trazabilidad) ? mockup.rf_trazabilidad : [])
      .map((id) => String(id || '').trim().toUpperCase()));
    const knownIds = new Set(functional.map(requirementId).filter(Boolean));
    const unknownIds = [...traceIds].filter((id) => !knownIds.has(id));
    if (unknownIds.length) errors.push(`Los mockups referencian requisitos inexistentes o no aprobados: ${unknownIds.join(', ')}.`);

    const rejectedReferences = [];
    generated = generated.map(mockup => ({
      ...mockup,
      rf_trazabilidad: (mockup.rf_trazabilidad || []).filter(id => {
        const requirement = functional.find(item => requirementId(item) === String(id).trim().toUpperCase());
        const supported = requirement && hasSemanticEvidence(requirement, mockup);
        if (!supported && requirement) rejectedReferences.push({ pantalla: mockup.nombre_pantalla || mockup.pantalla_id, requisito: requirementId(requirement) });
        return supported;
      })
    }));
    if (rejectedReferences.length) warnings.push(`Referencias sin evidencia local, no contabilizadas como cobertura: ${rejectedReferences.map(item => `${item.pantalla}: ${item.requisito}`).join('; ')}.`);

    const highUiRequirements = functional.filter((requirement) => isHighPriority(requirement) && hasHumanActor(requirement));
    const uncoveredHigh = highUiRequirements
      .filter((requirement) => {
        const id = requirementId(requirement);
        return !generated.some((mockup) => {
          const traced = (mockup.rf_trazabilidad || []).map((item) => String(item).toUpperCase()).includes(id);
          return traced && hasSemanticEvidence(requirement, mockup);
        });
      })
      .map((requirement) => requirementId(requirement) || requirement.nombre);
    if (uncoveredHigh.length) {
      const message = `No existe evidencia visible en mockups para RF de prioridad alta: ${uncoveredHigh.join(', ')}.`;
      warnings.push(message);
    }

    const requirementDetails = functional.map((requirement) => {
      const id = requirementId(requirement);
      const tracedMockups = generated.filter((mockup) =>
        (mockup.rf_trazabilidad || []).map((item) => String(item).toUpperCase()).includes(id)
      );
      const expected = expectedUiEvidence(requirement);
      const evidence = uiEvidence(tracedMockups, expected);
      const functionalCriteria = this.functionalCoverage.validate(requirement, tracedMockups);
      for (const criterion of functionalCriteria.filter(item => !item.presente)) {
        const message = `${id || requirement.nombre}: falta evidencia de ${criterion.tipo} (${criterion.valores.join(' / ')}).`;
        // Solo condiciones explícitas de RF altos bloquean. Las inferencias
        // lingüísticas se muestran para revisión, no como reglas inventadas.
        if (criterion.confianza === 'explicita' && isHighPriority(requirement)) errors.push(message);
        else warnings.push(message);
      }
      const missing = Object.entries(evidence).filter(([, present]) => !present).map(([kind]) => kind);
      if (tracedMockups.length && missing.length) {
        const labels = { roles: 'roles', fields: 'campos de entrada', actions: 'acciones', states: 'estados' };
        const message = `${id || requirement.nombre} no representa: ${missing.map((kind) => labels[kind]).join(', ')}.`;
        // La detección general por palabras/etiquetas no acredita una omisión.
        // Los criterios explícitos y controles estructurales se validan aparte.
        warnings.push(message);
      }
      return {
        requisito: id || requirement.nombre,
        prioridad: requirement.prioridad || 'Media',
        pantallas: tracedMockups.map((mockup) => mockup.nombre_visible || mockup.nombre_pantalla),
        esperado: expected,
        evidencia: evidence,
        criterios_funcionales: functionalCriteria,
        faltantes: missing
      };
    });

    const untracedMockups = generated
      .filter((mockup) => !Array.isArray(mockup.rf_trazabilidad) || mockup.rf_trazabilidad.length === 0)
      .map((mockup) => mockup.nombre_visible || mockup.nombre_pantalla);
    if (functional.length && untracedMockups.length) warnings.push(`Pantallas sin RF asociado: ${untracedMockups.join(', ')}.`);

    return {
      valido: errors.length === 0,
      estado: missingScreens.length ? 'pendiente' : 'completo',
      completo: missingScreens.length === 0,
      errores: errors,
      advertencias: warnings,
      metricas: {
        pantallas_arbol: screens.length,
        mockups_generados: generated.length,
        pantallas_faltantes: missingScreens,
        mockups_huerfanos: orphanMockups,
        rf_altos_ui: highUiRequirements.length,
        rf_altos_ui_cubiertos: highUiRequirements.length - uncoveredHigh.length,
        rf_altos_ui_sin_cobertura: uncoveredHigh,
        cobertura_rf_altos_porcentaje: highUiRequirements.length
          ? Math.round(((highUiRequirements.length - uncoveredHigh.length) / highUiRequirements.length) * 100)
          : 100,
        detalle_rf: requirementDetails,
        criterios_ui_evaluados: requirementDetails.reduce((sum, item) => sum + item.criterios_funcionales.length, 0),
        criterios_ui_con_evidencia: requirementDetails.reduce((sum, item) => sum + item.criterios_funcionales.filter(criterion => criterion.presente).length, 0),
        referencias_sin_evidencia: rejectedReferences
      },
      validado_en: new Date()
    };
  }

  functionalRequirements(requirements) {
    return (Array.isArray(requirements) ? requirements : [])
      .filter((requirement) => String(requirement?.tipo || '').toUpperCase() === 'RF' && requirement?.aprobado !== false);
  }
}

module.exports = MockupTraceabilityService;
