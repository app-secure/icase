/**
 * Reparaciones deterministas del HTML de un mockup, sin IA: arreglan lo que un modelo pequeño deja a medias y que ya sabemos corregir.
 *  - Filas «Cargando…» (el modelo las pensó para rellenarlas con un script, que se elimina): se sustituyen por filas de ejemplo.
 *  - Clases comodín sin definir (`btn-primary`, `table-container`…): se definen solo las que la pantalla usa.
 *  - Moneda: los importes con `$` usan la moneda del proyecto cuando los requisitos la indican.
 *  - Codificación: texto con caracteres rotos (`sesi�n`, `PÃ©rez`) se restituye.
 *  - Controles de filtro u otros claramente visuales («Todos», «Cerrar») se marcan como solo interfaz.
 * No inventa operaciones ni cambia la estructura de la pantalla.
 */
const MockupBindingValidator = require('./MockupBindingValidator');

const strip = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const text = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const LOADING = /^(?:cargando|loading|obteniendo|recuperando|buscando)\b|^(?:no hay|sin) (?:datos|registros|resultados)\b/i;

// Palabras habituales de una interfaz en español, para devolverles su tilde cuando llegan con un carácter roto.
const WORDS = ['sesión', 'contraseña', 'código', 'teléfono', 'número', 'descripción', 'dirección', 'información', 'configuración', 'gestión', 'reservación', 'acción', 'acciones', 'operación', 'transacción', 'administración', 'atención', 'producción', 'cancelación', 'confirmación', 'validación', 'selección', 'ubicación', 'creación', 'edición', 'eliminación', 'modificación', 'notificación', 'recuperación', 'autenticación', 'sesiones', 'pérez', 'gonzález', 'martínez', 'rodríguez', 'fernández', 'gómez', 'lópez', 'hernández', 'sánchez', 'ramírez', 'díaz', 'garcía', 'maría', 'josé', 'jesús', 'menú', 'más', 'está', 'sí', 'también', 'días', 'crédito', 'débito', 'último', 'últimos', 'histórico', 'método', 'métodos', 'electrónico', 'categoría', 'categorías', 'año', 'años', 'diseño', 'señal', 'cliente', 'catálogo', 'cuánto', 'cómo', 'qué', 'dónde', 'estadística', 'estadísticas', 'inventario', 'canje', 'sillón', 'almacén', 'jamón', 'limón', 'camarón', 'ají', 'café', 'té', 'cobró', 'pagó', 'salón', 'comisión', 'versión', 'visualización', 'ubicación', 'presentación', 'liquidación', 'conciliación'];

const ALIASES = {
  'btn-primary': '.btn-primary{display:inline-block;padding:.5rem 1rem;border:0;border-radius:.5rem;background:var(--icase-primary,#0b57d0);color:#fff;font-weight:500;cursor:pointer}',
  'btn-secondary': '.btn-secondary{display:inline-block;padding:.5rem 1rem;border:1px solid #cbd5e1;border-radius:.5rem;background:#fff;color:#334155;font-weight:500;cursor:pointer}',
  'btn-danger': '.btn-danger{display:inline-block;padding:.5rem 1rem;border:0;border-radius:.5rem;background:var(--icase-error,#dc2626);color:#fff;font-weight:500;cursor:pointer}',
  'btn': '.btn{display:inline-block;padding:.5rem 1rem;border-radius:.5rem;font-weight:500;cursor:pointer}',
  'table-container': '.table-container{background:#fff;border:1px solid #e2e8f0;border-radius:.5rem;overflow-x:auto}.table-container table{width:100%;border-collapse:collapse;text-align:left}.table-container th,.table-container td{padding:.75rem 1rem;border-bottom:1px solid #e2e8f0}',
  'table-header': '.table-header{background:#f8fafc;color:#475569;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em}',
  'card': '.card{background:#fff;border:1px solid #e2e8f0;border-radius:.75rem;padding:1.25rem}',
  'badge': '.badge{display:inline-block;padding:.125rem .5rem;border-radius:9999px;font-size:.75rem;font-weight:600;background:#e2e8f0;color:#334155}',
  'badge-success': '.badge-success{background:#d1fae5;color:#065f46}',
  'badge-warning': '.badge-warning{background:#fef3c7;color:#92400e}',
  'badge-danger': '.badge-danger{background:#fee2e2;color:#991b1b}',
  'form-input': '.form-input{width:100%;padding:.5rem .75rem;border:1px solid #cbd5e1;border-radius:.5rem;background:#fff}',
  'form-label': '.form-label{display:block;margin-bottom:.25rem;font-weight:500;color:#334155}'
};

// Controles que solo cambian la vista; sin una operación de negocio detrás.
const UI_ONLY = /^(?:todos?|todas?|hoy|ayer|semana|mes|a[nñ]o|activos?|inactivos?|filtrar|limpiar(?: filtros)?|quitar filtros|cancelar|cerrar|volver|regresar|atr[aá]s|imprimir|exportar|descargar|siguiente|anterior|mostrar|ocultar|ver m[aá]s|ver menos|expandir|contraer|actualizar vista|iniciar sesi[oó]n|ingresar|entrar|acceder|cerrar sesi[oó]n|salir|enviar enlace|recuperar contrase[nñ]a|restablecer contrase[nñ]a|olvid[eé] mi contrase[nñ]a)$/;

const NAMES = ['Ana Torres', 'Luis Ramos', 'Carla Díaz', 'Marco Vega'];
const DISHES = ['Lomo saltado', 'Ají de gallina', 'Ceviche clásico', 'Arroz con pollo'];

function money(index, currency) {
  const amount = [45.5, 28, 120.75, 35][index % 4].toFixed(2);
  return currency ? `${currency} ${amount}` : amount;
}

/** Valor de ejemplo para una columna según su encabezado. */
function sample(header, index, currency) {
  const key = strip(header);
  if (/accion|opcion/.test(key)) return null;
  if (/correo|email/.test(key)) return `${strip(NAMES[index % 4]).replace(' ', '.')}@ejemplo.com`;
  if (/rol|perfil/.test(key)) return ['Mesero', 'Cajero', 'Cocinero', 'Administrador'][index % 4];
  if (/estado|situacion/.test(key)) return ['Activo', 'Pendiente', 'Completado'][index % 3];
  if (/fecha|hora|creacion|registro|cierre|apertura/.test(key)) return `${19 - index}/11/2026 ${12 + index}:${index % 2 ? '30' : '05'}`;
  if (/importe|total|monto|precio|valor|pago|saldo|fondo|ingreso|venta/.test(key) && !/medio|metodo|tipo/.test(key)) return money(index, currency);
  if (/medio|metodo|tipo de pago/.test(key)) return ['Efectivo', 'Transferencia', 'Efectivo'][index % 3];
  if (/plato|producto|item|articulo|descripcion|detalle|concepto/.test(key)) return DISHES[index % 4];
  if (/zona|salon|area|ubicacion/.test(key)) return ['Terraza', 'Salón principal', 'Barra'][index % 3];
  if (/cantidad|usos|puntos|unidades|mesa|numero|n[°º]|codigo|#|\bid\b/.test(key)) return String([2, 5, 1, 3][index % 4] + (/puntos/.test(key) ? 100 : 0));
  if (/nombre|cliente|usuario|responsable|mesero|cajero|cocinero|titular|persona|empleado/.test(key)) return NAMES[index % 4];
  return `${header.trim() || 'Dato'} ${index + 1}`;
}

class MockupContentRepair {
  /** Moneda que indican los requisitos o el proyecto, o null si no la dicen. */
  static currencyOf({ proyecto = null, requerimientos = [] } = {}) {
    const corpus = [proyecto?.descripcion, ...requerimientos.map((item) => `${item.nombre || ''} ${item.descripcion || ''} ${JSON.stringify(item.criterios_aceptacion || [])}`)].join(' ');
    if (/\bsoles?\b|\bPEN\b|S\/\s?\.?\s?\d|\bS\/\./i.test(corpus)) return 'S/';
    if (/\beuros?\b|€/i.test(corpus)) return '€';
    if (/\bd[oó]lares?\b|\bUSD\b|US\$|\bpesos?\b|\bMXN\b|\bCOP\b|\bARS\b|\bCLP\b/i.test(corpus)) return '$';
    return null;
  }

  reparar(html, { moneda = null, contrato = null, requerimientos = [], identidad = null } = {}) {
    if (!html || typeof html !== 'string') return { html, cambios: [] };
    let result = html;
    const cambios = [];
    const step = (next, message) => { if (next !== result) { result = next; cambios.push(message); } };

    step(this._encoding(result), 'Texto con caracteres rotos restituido');
    step(this._loadingRows(result, moneda), 'Filas «Cargando…» sustituidas por filas de ejemplo');
    step(this._currency(result, moneda), `Importes con la moneda del proyecto (${moneda})`);
    step(this._aliases(result), 'Clases comodín sin definir añadidas');
    step(this._uiOnly(result, { contrato, requerimientos, identidad }), 'Controles de filtro u otros solo visuales marcados como solo interfaz');
    return { html: result, cambios };
  }

  /** Filas de carga o vacías de una tabla: la maqueta es estática, así que se rellenan con ejemplos coherentes con sus encabezados. */
  _loadingRows(html, currency) {
    return html.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => {
      const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) => text(match[1]));
      if (!headers.length) return table;
      let touched = false;
      const repaired = table.replace(/<tbody\b([^>]*)>([\s\S]*?)<\/tbody>/gi, (whole, attrs, body) => {
        const rows = [...body.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
        const placeholder = !rows.length || rows.every((row) => LOADING.test(text(row)));
        if (!placeholder) return whole;
        touched = true;
        const generated = [0, 1, 2].map((index) => `<tr class="border-b border-slate-200">${headers.map((header) => {
          const value = sample(header, index, currency);
          const cell = value === null ? '<button type="button" class="text-blue-600 hover:underline text-xs font-medium">Ver</button>' : value;
          return `<td class="px-4 py-3">${cell}</td>`;
        }).join('')}</tr>`).join('');
        return `<tbody${attrs}>${generated}</tbody>`;
      });
      return touched ? repaired : table;
    });
  }

  _currency(html, currency) {
    if (!currency || currency === '$') return html;
    // Solo el texto: no se toca nada dentro de etiquetas, scripts ni estilos.
    return html.replace(/(<(?:script|style)\b[\s\S]*?<\/(?:script|style)>)|(>)([^<]*)(?=<)/gi, (match, block, gt, content) => {
      if (block) return block;
      return `${gt}${content.replace(/\$\s?(?=\d)/g, `${currency} `)}`;
    });
  }

  _aliases(html) {
    const defined = new Set([...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].flatMap((style) => [...style[1].matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1])));
    const used = new Set([...html.matchAll(/\bclass\s*=\s*["']([^"']*)["']/gi)].flatMap((match) => match[1].split(/\s+/)));
    const missing = Object.keys(ALIASES).filter((name) => used.has(name) && !defined.has(name));
    if (!missing.length) return html;
    const style = `<style id="icase-aliases">${missing.map((name) => ALIASES[name]).join('')}</style>`;
    return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${style}</head>`) : `${style}${html}`;
  }

  _uiOnly(html, { contrato, requerimientos, identidad }) {
    const validator = new MockupBindingValidator();
    const check = validator.validar({ html, requerimientos, contrato, identidad });
    const labels = check.advertencias.filter((item) => item.startsWith('sin enlace: ')).map((item) => item.slice('sin enlace: '.length)).filter((label) => UI_ONLY.test(strip(label)));
    // El acceso lo resuelve la sesión de la aplicación (no un registro de datos) y las pestañas de un grupo solo cambian la vista.
    const marked = labels.length ? validator.marcarSinEnlace(html, { controles: labels }).html : html;
    return validator.marcarSinEnlace(marked, { soloGrupos: true }).html;
  }

  /** Mojibake clásico (UTF-8 leído como Latin-1) y caracteres de sustitución con tilde perdida. */
  _encoding(html) {
    let result = html;
    if (/[ÃÂ][\u0080-¿]/.test(result)) {
      const fixed = Buffer.from(result, 'latin1').toString('utf8');
      if ((fixed.match(/�/g) || []).length <= (result.match(/�/g) || []).length) result = fixed;
    }
    if (!result.includes('�')) return result;
    return result.replace(/(>)([^<]*�[^<]*)(?=<)/g, (match, gt, content) => `${gt}${content.replace(/[\p{L}�]*�[\p{L}�]*/gu, (token) => this._restore(token))}`);
  }

  _restore(token) {
    const pattern = new RegExp(`^${token.toLowerCase().replace(/�/g, '.')}$`, 'u');
    const word = WORDS.find((candidate) => pattern.test(candidate));
    if (!word) return token;
    if (token === token.toUpperCase() && token.length > 1) return word.toUpperCase();
    return token[0] === token[0].toUpperCase() && token[0] !== token[0].toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  }
}

module.exports = MockupContentRepair;
