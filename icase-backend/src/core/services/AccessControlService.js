/**
 * Control de acceso del sistema generado: autenticación y matriz de permisos rol × operación × método.
 *
 * Los roles salen de los actores de los RF aprobados y la matriz se deriva de forma determinista
 * (sin IA). La persona que revisa la etapa ajusta lo que corresponda antes de aprobarla.
 */
const METHODS = Object.freeze(['GET', 'POST', 'PATCH', 'DELETE']);
const AUTH_METHODS = Object.freeze(['jwt', 'ninguna']);
const EXPIRATIONS = Object.freeze(['1h', '8h', '24h', '7d']);
const ADMIN_ROLE = 'administrador';
// Actores que suelen ser sistemas externos y no personas con credenciales.
const SYSTEM_ACTOR = /^(?:sistema|system|api|servicio|servidor|pasarela|gateway|base de datos|cron|scheduler|bot|plataforma externa)\b/i;

const slug = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const operationKey = (identificador) => slug(identificador);

class AccessControlService {
  /** Propuesta inicial: un rol por actor humano y acceso completo a los RF donde participa. */
  proponer({ requerimientos = [] } = {}) {
    const rf = requerimientos.filter((item) => item.aprobado && item.tipo === 'RF');
    const roles = new Map();
    const permisos = [];
    let adminMencionado = false;
    for (const requisito of rf) {
      const actores = (Array.isArray(requisito.actores) ? requisito.actores : [requisito.actores]).map((item) => String(item || '').trim()).filter(Boolean);
      for (const actor of actores) {
        const id = slug(actor);
        if (!id) continue;
        if (id === ADMIN_ROLE) { adminMencionado = true; continue; }
        if (!roles.has(id)) roles.set(id, { id, nombre: actor, incluir: !SYSTEM_ACTOR.test(actor), autoregistro: false });
        permisos.push({ operacion: requisito.identificador, rol: id, metodos: [...METHODS] });
      }
    }
    const lista = [...roles.values()];
    const excluidos = lista.filter((item) => !item.incluir).map((item) => item.nombre);
    return {
      valor: {
        autenticacion: { metodo: 'jwt', expiracion: '8h' },
        roles: lista,
        permisos: permisos.filter((item) => roles.get(item.rol).incluir),
        operaciones: rf.map((item) => ({ id: item.identificador, nombre: item.nombre })),
        notas: 'Cada actor de los RF aprobados es un rol con todos los permisos sobre las operaciones donde participa. Reduce los permisos al mínimo necesario. El rol «administrador» siempre existe, gestiona usuarios y puede operar todo.'
      },
      advertencias: [
        ...(adminMencionado ? ['El actor «Administrador» corresponde al rol administrador del sistema, que siempre existe.'] : []),
        ...(excluidos.length ? [`Se excluyeron por parecer sistemas externos (puedes incluirlos): ${excluidos.join(', ')}.`] : []),
        ...(!lista.length ? ['Ningún RF declara actores; solo el administrador podrá operar el sistema.'] : [])
      ]
    };
  }

  /** Valida y normaliza una propuesta contra los RF aprobados. */
  validar(propuesta, { requerimientos = [] } = {}) {
    const errores = [];
    const advertencias = [];
    const rf = requerimientos.filter((item) => item.aprobado && item.tipo === 'RF');
    const operaciones = rf.map((item) => ({ id: item.identificador, nombre: item.nombre }));
    const conocidas = new Set(operaciones.map((item) => String(item.id).toUpperCase()));
    const origen = propuesta && typeof propuesta === 'object' && !Array.isArray(propuesta) ? propuesta : {};

    const autenticacion = { metodo: origen.autenticacion?.metodo || 'jwt', expiracion: origen.autenticacion?.expiracion || '8h' };
    if (!AUTH_METHODS.includes(autenticacion.metodo)) errores.push(`El método de autenticación debe ser uno de: ${AUTH_METHODS.join(', ')}.`);
    if (!EXPIRATIONS.includes(autenticacion.expiracion)) errores.push(`La expiración de la sesión debe ser una de: ${EXPIRATIONS.join(', ')}.`);

    const roles = [];
    const vistos = new Set();
    const listaRoles = Array.isArray(origen.roles) ? origen.roles : [];
    if (origen.roles !== undefined && !Array.isArray(origen.roles)) errores.push('"roles" debe ser una lista.');
    if (listaRoles.length > 30) errores.push('No se admiten más de 30 roles.');
    listaRoles.forEach((rol, index) => {
      const nombre = String(rol?.nombre || '').trim();
      const id = slug(rol?.id || nombre);
      if (!nombre || nombre.length > 60 || !id) { errores.push(`El rol #${index + 1} necesita un nombre de hasta 60 caracteres.`); return; }
      if (id === ADMIN_ROLE) { errores.push('El rol «administrador» está reservado: existe siempre y no se declara.'); return; }
      if (vistos.has(id)) { errores.push(`El rol «${id}» está repetido.`); return; }
      vistos.add(id);
      roles.push({ id, nombre, incluir: rol.incluir !== false, autoregistro: rol.incluir !== false && rol.autoregistro === true });
    });
    const incluidos = new Set(roles.filter((item) => item.incluir).map((item) => item.id));

    const fusionados = new Map();
    const listaPermisos = Array.isArray(origen.permisos) ? origen.permisos : [];
    if (origen.permisos !== undefined && !Array.isArray(origen.permisos)) errores.push('"permisos" debe ser una lista.');
    listaPermisos.forEach((permiso, index) => {
      const etiqueta = `Permiso #${index + 1}`;
      const operacion = String(permiso?.operacion || '').toUpperCase();
      const rol = slug(permiso?.rol);
      const metodos = [...new Set((Array.isArray(permiso?.metodos) ? permiso.metodos : []).map((item) => String(item).toUpperCase()))];
      if (!conocidas.has(operacion)) { errores.push(`${etiqueta}: la operación «${permiso?.operacion}» no corresponde a un RF aprobado.`); return; }
      if (!vistos.has(rol)) { errores.push(`${etiqueta}: el rol «${permiso?.rol}» no está declarado.`); return; }
      if (!metodos.length || metodos.some((item) => !METHODS.includes(item))) { errores.push(`${etiqueta}: los métodos deben ser un subconjunto de ${METHODS.join(', ')}.`); return; }
      if (!incluidos.has(rol)) { advertencias.push(`Se ignoraron los permisos del rol «${rol}» porque no está incluido.`); return; }
      const clave = `${operacion}|${rol}`;
      fusionados.set(clave, { operacion: rf.find((item) => String(item.identificador).toUpperCase() === operacion).identificador, rol, metodos: [...new Set([...(fusionados.get(clave)?.metodos || []), ...metodos])] });
    });
    const permisos = [...fusionados.values()].map((item) => ({ ...item, metodos: METHODS.filter((method) => item.metodos.includes(method)) }));

    if (autenticacion.metodo === 'ninguna') {
      advertencias.push('Sin autenticación, cualquier persona con acceso a la red podrá leer, crear, modificar y eliminar datos.');
    } else {
      const sinAcceso = operaciones.filter((op) => !permisos.some((item) => item.operacion === op.id)).map((op) => op.id);
      if (sinAcceso.length) advertencias.push(`Solo el administrador podrá operar: ${sinAcceso.join(', ')}.`);
      const expuestos = roles.filter((item) => item.autoregistro && permisos.some((permiso) => permiso.rol === item.id && permiso.metodos.some((method) => method !== 'GET')));
      if (expuestos.length) advertencias.push(`Los roles con autoregistro pueden escribir datos sin intervención del administrador: ${expuestos.map((item) => item.nombre).join(', ')}.`);
    }

    return {
      propuesta: { autenticacion, roles, permisos, operaciones, notas: String(origen.notas || '') },
      errores,
      advertencias
    };
  }

  /**
   * Política ejecutable para el backend generado.
   * @param {object} propuesta propuesta ya aprobada
   * @param {Array<{id: string, key: string}>} operaciones operaciones del contrato
   */
  politica(propuesta, operaciones) {
    if (!propuesta || propuesta.autenticacion?.metodo !== 'jwt') return { habilitada: false };
    const incluidos = (propuesta.roles || []).filter((item) => item.incluir !== false);
    const llaves = new Map(operaciones.map((item) => [String(item.id).toUpperCase(), item.key]));
    const porOperacion = Object.fromEntries(operaciones.map((item) => [item.key, {}]));
    for (const permiso of propuesta.permisos || []) {
      const key = llaves.get(String(permiso.operacion).toUpperCase());
      if (key && incluidos.some((rol) => rol.id === permiso.rol)) porOperacion[key][permiso.rol] = [...permiso.metodos];
    }
    return {
      habilitada: true,
      expiracion: propuesta.autenticacion.expiracion || '8h',
      roles: Object.fromEntries(incluidos.map((rol) => [rol.id, { nombre: rol.nombre, autoregistro: rol.autoregistro === true }])),
      operaciones: porOperacion
    };
  }
}

AccessControlService.METHODS = METHODS;
AccessControlService.ADMIN_ROLE = ADMIN_ROLE;
AccessControlService.operationKey = operationKey;
module.exports = AccessControlService;
