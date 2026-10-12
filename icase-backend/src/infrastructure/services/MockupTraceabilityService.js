const STOPWORDS = new Set([
  'accion', 'actualizar', 'administrar', 'aplicacion', 'crear', 'debe', 'digital',
  'el', 'en', 'gestionar', 'gestion', 'la', 'las', 'los', 'mostrar', 'nuevo',
  'para', 'permitir', 'procesar', 'realizar', 'registrar', 'sistema', 'una',
  'usuario', 'validar', 'ver'
]);

const SYNONYMS = new Map([
  ['cobrar', 'pago'], ['cobro', 'pago'], ['pagar', 'pago'],
  ['comanda', 'pedido'], ['orden', 'pedido'],
  ['reservacion', 'reserva'], ['reservar', 'reserva'],
  ['reporte', 'informe'], ['report', 'informe'],
  ['platillo', 'plato'], ['prepagado', 'paquete'], ['prepago', 'paquete']
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
  return [...new Set(normalize(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
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

function screenText(screen) {
  return [
    screen?.nombre, screen?.nombre_visible, screen?.nombre_pantalla, screen?.ruta,
    screen?.modulo, screen?.flujo, screen?.componentes, screen?.elementos_visibles,
    screen?.acciones_principales, screen?.campos_formulario?.map((field) => field?.nombre),
    screen?.preview_code
  ].flat(Infinity).filter(Boolean).join(' ');
}

function hasSemanticEvidence(requirement, screen) {
  const expected = tokens(requirementText(requirement));
  const actual = new Set(tokens(screenText(screen)));
  return expected.some((token) => actual.has(token));
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
      return roles.has(normalizedActor) || normalized.includes(normalizedActor);
    }),
    fields: !expected.fields || mockups.some((mockup) =>
      (Array.isArray(mockup?.campos_formulario) && mockup.campos_formulario.length > 0) ||
      /<(?:input|select|textarea)\b/i.test(mockup?.preview_code || '')
    ),
    actions: !expected.actions || mockups.some((mockup) =>
      (Array.isArray(mockup?.acciones_principales) && mockup.acciones_principales.length > 0) ||
      /<(?:button|a)\b/i.test(mockup?.preview_code || '')
    ),
    states: !expected.states || /\b(estado|disponible|agotado|pendiente|aprobado|rechazado|confirmado|cancelado|preparacion|listo|activo|inactivo)\b/.test(normalized)
  };
}

class MockupTraceabilityService {
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
    const known = new Map(functional.map((requirement) => [requirementId(requirement), requirement]));
    const declared = (Array.isArray(mockup?.rf_trazabilidad) ? mockup.rf_trazabilidad : [])
      .map((item) => String(item || '').trim().toUpperCase())
      .filter((id) => known.has(id));
    const inferred = functional
      .filter((requirement) => hasSemanticEvidence(requirement, { ...screen, ...mockup }))
      .map(requirementId);
    const inherited = Array.isArray(screen?.rf_trazabilidad) ? screen.rf_trazabilidad : [];
    return [...new Set([...declared, ...inferred, ...inherited].filter(Boolean))];
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
    const generated = Array.isArray(mockups) ? mockups : [];
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
      errors.push(message);
    }

    const requirementDetails = functional.map((requirement) => {
      const id = requirementId(requirement);
      const tracedMockups = generated.filter((mockup) =>
        (mockup.rf_trazabilidad || []).map((item) => String(item).toUpperCase()).includes(id)
      );
      const expected = expectedUiEvidence(requirement);
      const evidence = uiEvidence(tracedMockups, expected);
      const missing = Object.entries(evidence).filter(([, present]) => !present).map(([kind]) => kind);
      if (tracedMockups.length && missing.length) {
        const labels = { roles: 'roles', fields: 'campos de entrada', actions: 'acciones', states: 'estados' };
        const message = `${id || requirement.nombre} no representa: ${missing.map((kind) => labels[kind]).join(', ')}.`;
        if (isHighPriority(requirement)) errors.push(message);
        else warnings.push(message);
      }
      return {
        requisito: id || requirement.nombre,
        prioridad: requirement.prioridad || 'Media',
        pantallas: tracedMockups.map((mockup) => mockup.nombre_visible || mockup.nombre_pantalla),
        esperado: expected,
        evidencia: evidence,
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
        detalle_rf: requirementDetails
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
