/**
 * Módulos de la aplicación generada.
 *
 * Un módulo es una funcionalidad que el generador sabe producir con plantillas deterministas. Hay dos clases:
 *  - incluidos: los decide otra etapa (autenticación, reglas, plataforma) o van siempre; aquí solo se muestran.
 *  - opcionales: el usuario los activa o desactiva en la etapa «Módulos».
 *
 * La etapa es opcional. Mientras no se apruebe rige el modo automático (los valores `porDefecto`), así los proyectos
 * existentes siguen generándose igual. En modo personalizado se respeta la elección, y el modo se guarda para que la
 * propuesta aprobada sea reproducible aunque el catálogo cambie de valores por defecto.
 */
const MODES = Object.freeze(['automatico', 'personalizado']);

// Los incluidos se calculan desde las decisiones ya aprobadas.
const INCLUDED = Object.freeze([
  { id: 'datos', etiqueta: 'Datos por entidad', categoria: 'datos', descripcion: 'Tabla o colección por entidad, migraciones, claves foráneas y validación de tipos.', activo: () => true, motivo: () => 'Va siempre.' },
  { id: 'openapi', etiqueta: 'Documentación OpenAPI', categoria: 'api', descripcion: 'Documento OpenAPI 3.1 derivado del contrato y endpoint /api/openapi.json.', activo: () => true, motivo: () => 'Va siempre.' },
  { id: 'informe', etiqueta: 'Informe de generación', categoria: 'documentacion', descripcion: 'Qué se generó de cada requisito y qué no.', activo: () => true, motivo: () => 'Va siempre.' },
  {
    id: 'reglas', etiqueta: 'Reglas de negocio', categoria: 'datos', descripcion: 'Validaciones declarativas aplicadas por el motor de reglas del backend.',
    activo: (decisions) => (decisions.reglas_negocio?.reglas || []).some((rule) => rule.estado_decision === 'confirmado'),
    motivo: (decisions) => {
      const total = (decisions.reglas_negocio?.reglas || []).filter((rule) => rule.estado_decision === 'confirmado').length;
      return total ? `${total} reglas confirmadas en la etapa «Reglas de negocio».` : 'No hay reglas confirmadas en la etapa «Reglas de negocio».';
    }
  },
  {
    id: 'autenticacion', etiqueta: 'Autenticación y roles', categoria: 'seguridad', descripcion: 'Sesión con JWT, roles, permisos por operación y gestión de usuarios.',
    activo: (decisions) => decisions.control_acceso?.autenticacion?.metodo === 'jwt',
    motivo: (decisions) => decisions.control_acceso?.autenticacion?.metodo === 'jwt'
      ? 'Aprobada en la etapa «Autenticación y roles».' : 'La etapa «Autenticación y roles» eligió una API sin sesión.'
  },
  {
    id: 'app_movil', etiqueta: 'App móvil (Expo)', categoria: 'interfaz', descripcion: 'Paquete Expo con las mismas operaciones; no es un APK ni un IPA firmado.',
    activo: (decisions) => [...(decisions.alcance_plataforma?.plataformas || []), ...(decisions.stack_tecnologico?.plataformas || [])].includes('móvil'),
    motivo: (decisions) => [...(decisions.alcance_plataforma?.plataformas || []), ...(decisions.stack_tecnologico?.plataformas || [])].includes('móvil')
      ? 'La plataforma móvil está incluida en el alcance.' : 'El alcance no incluye plataforma móvil.'
  }
]);

const OPTIONAL = Object.freeze([
  {
    id: 'formularios_tipados', etiqueta: 'Formularios y tablas por campo', categoria: 'interfaz', porDefecto: true,
    descripcion: 'La interfaz web muestra un formulario con un control por campo (texto, número, fecha, lista de opciones, casilla, entidad relacionada) y una tabla de registros, en lugar de pedir JSON a mano.',
    sinEfecto: 'Si una entidad no tiene campos declarados en el diagrama de dominio, esa pantalla sigue usando el editor JSON.',
    requiere: []
  },
  {
    id: 'paginacion_busqueda', etiqueta: 'Paginación, filtros y búsqueda', categoria: 'api', porDefecto: true,
    descripcion: 'Soporte en la API para paginación (parámetros page y limit), búsqueda textual (parámetro search) y filtros por campo, con metadatos de paginación y controles en la interfaz.',
    sinEfecto: 'Sin entidades en el modelo de dominio, la búsqueda opera sobre los atributos genéricos del registro.',
    requiere: []
  },
  {
    id: 'datos_iniciales', etiqueta: 'Datos iniciales (seed deterministas)', categoria: 'datos', porDefecto: true,
    descripcion: 'Genera y carga registros iniciales reproducibles para cada entidad a partir de sus tipos, restricciones y valores de ejemplo.',
    sinEfecto: 'Si no hay entidades en el modelo de dominio no se generan registros de prueba.',
    requiere: []
  }
]);

const known = new Map(OPTIONAL.map((item) => [item.id, item]));

class ModuleService {
  /** Catálogo de módulos opcionales (sin estado). */
  static opcionales() { return OPTIONAL.map(({ id, etiqueta, categoria, descripcion, sinEfecto, porDefecto }) => ({ id, etiqueta, categoria, descripcion, sinEfecto, porDefecto })); }

  /** Valores del modo automático. */
  automatico() { return OPTIONAL.map((item) => ({ id: item.id, activo: item.porDefecto })); }

  /** Módulos que decide otra etapa, con su estado según las decisiones aprobadas. */
  incluidos(decisions = {}) {
    return INCLUDED.map((item) => ({ id: item.id, etiqueta: item.etiqueta, categoria: item.categoria, descripcion: item.descripcion, activo: Boolean(item.activo(decisions)), motivo: item.motivo(decisions) }));
  }

  /** Propuesta inicial: modo automático con los valores por defecto y el resumen de lo ya incluido. */
  proponer({ decisiones = {} } = {}) {
    return {
      valor: {
        modo: 'automatico',
        modulos: OPTIONAL.map((item) => ({ id: item.id, activo: item.porDefecto, motivo: item.porDefecto ? 'Activado por el modo automático.' : 'Desactivado por el modo automático.' })),
        notas: 'El modo automático usa los módulos recomendados. Cambia a personalizado para activar o desactivar módulos opcionales.'
      },
      advertencias: []
    };
  }

  /** Valida y normaliza una propuesta; en modo automático la lista del usuario se ignora. */
  validar(propuesta) {
    const errores = [];
    const advertencias = [];
    if (!propuesta || typeof propuesta !== 'object' || Array.isArray(propuesta)) return { propuesta: null, errores: ['La propuesta de módulos debe ser un objeto.'], advertencias };
    const modo = propuesta.modo === undefined ? 'automatico' : propuesta.modo;
    if (!MODES.includes(modo)) errores.push(`Modo de módulos no válido: «${modo}». Usa ${MODES.join(' o ')}.`);

    const chosen = new Map();
    if (modo === 'personalizado') {
      if (!Array.isArray(propuesta.modulos)) errores.push('En modo personalizado "modulos" debe ser una lista.');
      for (const item of Array.isArray(propuesta.modulos) ? propuesta.modulos : []) {
        const id = String(item?.id || '');
        if (!known.has(id)) {
          errores.push(INCLUDED.some((included) => included.id === id)
            ? `El módulo «${id}» lo decide otra etapa y no se puede activar aquí.`
            : `Módulo desconocido: «${id}».`);
          continue;
        }
        if (typeof item.activo !== 'boolean') { errores.push(`El módulo «${id}» necesita "activo" verdadero o falso.`); continue; }
        if (chosen.has(id)) { errores.push(`El módulo «${id}» está repetido.`); continue; }
        chosen.set(id, item.activo);
      }
      for (const [id, active] of chosen) {
        for (const required of known.get(id).requiere) {
          if (active && chosen.get(required) === false) errores.push(`El módulo «${id}» necesita «${required}».`);
        }
      }
    }
    if (errores.length) return { propuesta: null, errores, advertencias };

    const modulos = OPTIONAL.map((item) => {
      const active = modo === 'personalizado' && chosen.has(item.id) ? chosen.get(item.id) : item.porDefecto;
      return { id: item.id, activo: active, motivo: modo === 'automatico' ? (active ? 'Activado por el modo automático.' : 'Desactivado por el modo automático.') : (active ? 'Activado por ti.' : 'Desactivado por ti.') };
    });
    if (modo === 'personalizado') {
      const omitted = OPTIONAL.filter((item) => !chosen.has(item.id)).map((item) => item.id);
      if (omitted.length) advertencias.push(`Sin elegir, se usa el valor recomendado para: ${omitted.join(', ')}.`);
    }
    return { propuesta: { ...propuesta, modo, modulos }, errores, advertencias };
  }

  /**
   * Ids de los módulos opcionales activos para generar. Sin etapa aprobada (o con una propuesta no válida) rige el
   * modo automático, que es lo que se generaba antes de que existiera la etapa.
   */
  activos(propuestaAprobada) {
    if (propuestaAprobada && typeof propuestaAprobada === 'object') {
      const { propuesta, errores } = this.validar(propuestaAprobada);
      if (!errores.length) return propuesta.modulos.filter((item) => item.activo).map((item) => item.id);
    }
    return this.automatico().filter((item) => item.activo).map((item) => item.id);
  }
}

ModuleService.MODES = MODES;
module.exports = ModuleService;
