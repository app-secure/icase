import React from 'react';
import { Check, X } from 'lucide-react';

const DECISIONS = [
  { value: 'confirmado', label: 'Confirmar', style: 'border-emerald-300 bg-emerald-50 text-emerald-700', icon: Check },
  { value: 'rechazado', label: 'Rechazar', style: 'border-red-300 bg-red-50 text-red-700', icon: X },
  { value: 'pendiente', label: 'Pendiente', style: 'border-slate-300 bg-white text-slate-600', icon: null }
];

const TYPE_LABEL = { consulta: 'Consulta', crear: 'Crear', actualizar: 'Actualizar', eliminar: 'Eliminar', transicion: 'Cambio de estado' };
const SESSION_LABEL = { 'usuario.id': 'la persona que inició sesión', 'usuario.email': 'el correo de quien inició sesión', 'usuario.rol': 'el rol de quien inició sesión' };
const COMPONENT_LABEL = { tabla: 'Tabla', tarjetas: 'Tarjetas', formulario: 'Formulario', detalle: 'Detalle', kpi: 'Indicador' };

const filterText = (filter) => {
  const target = filter.origen === 'sesion' ? SESSION_LABEL[filter.valor] || filter.valor
    : filter.origen === 'parametro' ? `el parámetro «${filter.valor}»` : `«${filter.valor}»`;
  return `${filter.campo} ${filter.operador === '==' ? 'es' : filter.operador} ${target}`;
};

/** Frase en lenguaje natural de lo que hará la operación; es lo que la persona revisa antes de aprobar. */
function describeOperation(op) {
  const filters = (op.filtros || []).map(filterText);
  const where = filters.length ? ` donde ${filters.join(' y ')}` : '';
  switch (op.tipo) {
    case 'consulta': return `Devuelve ${op.entidad}${where}${op.salida?.length ? ` (campos: ${op.salida.join(', ')})` : ' (todos los campos)'}.`;
    case 'crear': {
      const system = [...(op.sesionEntradas || []).map((item) => `${item.campo} (la cuenta de la sesión)`), ...(op.autoEntradas || []).map((item) => `${item.campo} (${{ inicial: 'el estado inicial', generado: 'un código que genera el sistema', cero: 'empieza en 0; lo calcula el sistema' }[item.valor] || 'la fecha del registro'})`)];
      return `Registra un ${op.entidad} con ${(op.entradas || []).join(', ') || 'sus campos'}.${system.length ? ` El sistema completa: ${system.join(', ')}.` : ''}`;
    }
    case 'actualizar': return `Modifica ${(op.entradas || []).join(', ') || 'campos'} de un ${op.entidad}${where}.`;
    case 'eliminar': return `Elimina un ${op.entidad}${where}.`;
    case 'transicion': return `Cambia ${op.transicion?.campo} de un ${op.entidad}${op.transicion?.de?.length ? ` desde ${op.transicion.de.join(' o ')}` : ''} a ${op.transicion?.a}.`;
    default: return op.descripcion || '';
  }
}

export default function SpecReviewPanel({ value, onChange, disabled }) {
  const operations = Array.isArray(value.operaciones) ? value.operaciones : [];
  const screens = Array.isArray(value.pantallas) ? value.pantallas : [];
  const count = (decision) => operations.filter((op) => op.estado_decision === decision).length;
  const patch = (name, changes) => onChange({ ...value, operaciones: operations.map((op) => (op.nombre === name ? { ...op, ...changes } : op)) });
  const confirmAi = () => onChange({ ...value, operaciones: operations.map((op) => (op.estado_decision === 'pendiente' && op.origen !== 'derivado' ? { ...op, estado_decision: 'confirmado' } : op)) });
  const usedBy = (name) => screens.filter((screen) => screen.componentes.some((c) => c.operacion === name || (c.acciones || []).some((a) => a.operacion === name))).map((screen) => screen.id);

  if (!operations.length) {
    return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
      No hay operaciones. Usa «Generar propuesta desde el proyecto», o aprueba la etapa vacía para que cada requisito use un CRUD genérico.
    </div>;
  }

  return <div className="space-y-4">
    {value.notas && <p className="text-xs text-slate-500">{value.notas}</p>}
    <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">{count('confirmado')} confirmadas</span>
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">{count('pendiente')} pendientes</span>
      <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">{count('rechazado')} rechazadas</span>
      <button type="button" disabled={disabled || !operations.some((op) => op.estado_decision === 'pendiente' && op.origen !== 'derivado')} onClick={confirmAi}
        className="ml-auto rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 font-semibold text-violet-700 disabled:opacity-50">Confirmar las propuestas con IA</button>
    </div>

    <section aria-label="Operaciones" className="space-y-3">
      {operations.map((op) => {
        const screensOf = usedBy(op.nombre);
        return <article key={op.nombre} className={`rounded-xl border p-4 ${op.estado_decision === 'rechazado' ? 'border-red-100 bg-red-50/40' : 'border-slate-200 bg-white'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-mono font-semibold text-slate-700">{op.nombre}</span>
                <span className="rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-700">{TYPE_LABEL[op.tipo] || op.tipo}</span>
                <span className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-500">{op.rf}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{op.entidad}</span>
                <span className={`rounded px-1.5 py-0.5 ${op.origen === 'derivado' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{op.origen === 'derivado' ? 'derivada sin IA: revísala' : 'propuesta con IA'}</span>
                {(op.actores || []).map((actor) => <span key={actor} className="rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">{actor}</span>)}
              </div>
              <p className="mt-2 text-sm font-medium text-slate-900">{describeOperation(op)}</p>
              {op.descripcion && <p className="mt-1 text-xs text-slate-500">{op.descripcion}</p>}
              <p className="mt-1 text-xs text-slate-500">{screensOf.length ? `Se usa en: ${screensOf.join(', ')}.` : 'Ninguna pantalla la usa todavía.'}</p>
            </div>
            <div className="flex gap-1" role="group" aria-label={`Decisión sobre ${op.nombre}`}>
              {DECISIONS.map(({ value: decision, label, style, icon: Icon }) => <button key={decision} type="button" disabled={disabled} aria-pressed={op.estado_decision === decision}
                onClick={() => patch(op.nombre, { estado_decision: decision })}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 ${op.estado_decision === decision ? style : 'border-slate-200 bg-white text-slate-400 hover:text-slate-600'}`}>
                {Icon && <Icon size={12} />}{label}
              </button>)}
            </div>
          </div>
        </article>;
      })}
    </section>

    {screens.length > 0 && <section aria-label="Pantallas" className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Qué tendrá cada pantalla</h3>
      {screens.map((screen) => <article key={screen.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="font-mono text-xs font-semibold text-slate-700">{screen.id}</h4>
        <ul className="mt-2 space-y-2">
          {screen.componentes.map((component, index) => {
            const rejected = operations.find((op) => op.nombre === component.operacion)?.estado_decision === 'rechazado';
            return <li key={index} className={`rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs ${rejected ? 'opacity-50' : ''}`}>
              <p className="font-semibold text-slate-800">{COMPONENT_LABEL[component.tipo] || component.tipo} · <span className="font-mono font-normal">{component.operacion}</span>{rejected ? ' (operación rechazada: no se generará)' : ''}</p>
              {component.campos?.length > 0 && <p className="mt-1 text-slate-600">Campos: {component.campos.join(', ')}</p>}
              {component.acciones?.length > 0 && <p className="mt-1 flex flex-wrap items-center gap-1 text-slate-600">Botones:
                {component.acciones.map((action) => <span key={`${action.etiqueta}-${action.operacion}`} className="rounded border border-slate-200 bg-white px-1.5 py-0.5">{action.etiqueta} → <span className="font-mono">{action.operacion}</span></span>)}
              </p>}
            </li>;
          })}
        </ul>
      </article>)}
    </section>}
  </div>;
}
