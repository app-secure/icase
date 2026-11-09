import React from 'react';
import { PanelLeft, PanelLeftClose, PanelRight, PanelRightClose } from 'lucide-react';

export function RequirementsReferencePanel({ open, onToggle, side = 'left', ...props }) {
  const Icon = side === 'right' ? PanelRight : PanelLeft;
  return open ? <ApprovedRequirementsSidebar {...props} side={side} onHide={onToggle} /> : (
    <div className={`flex shrink-0 flex-col border-slate-200 bg-slate-50 ${side === 'right' ? 'order-last border-l' : 'border-r'}`}>
      <button type="button" onClick={onToggle} aria-label="Mostrar requisitos aprobados" aria-expanded={false} aria-controls="approved-requirements-sidebar" title="Mostrar requisitos aprobados" className="m-1 flex flex-col items-center gap-2 rounded-lg px-2 py-3 text-violet-700 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-violet-600">
        <Icon size={18} /><span className="text-xs font-medium [writing-mode:vertical-rl]">Requisitos</span>
      </button>
    </div>
  );
}

const textOf = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

function Field({ label, value }) {
  const text = Array.isArray(value) ? value.map(textOf).filter(Boolean).join(', ') : textOf(value);
  return text ? <p className="whitespace-pre-wrap break-words"><span className="font-medium text-slate-700">{label}: </span>{text}</p> : null;
}

function Requirement({ item, index, prefix }) {
  const id = item.identificador || item.id || `${prefix}-${String(index + 1).padStart(2, '0')}`;
  const evidence = item.evidences || item.evidencias || [];
  const criteria = item.acceptanceCriteria || item.criterios_aceptacion || [];
  return <details className="rounded-lg border border-slate-200 bg-white p-3">
    <summary className="cursor-pointer break-words text-xs font-semibold text-slate-800">
      <span className="mr-1.5 text-violet-700">{id}</span>{item.name || item.nombre || item.category || 'Requisito'}
    </summary>
    <div className="mt-2 space-y-2 text-xs leading-relaxed text-slate-600">
      <Field label="Descripción" value={item.description || item.descripcion} />
      <Field label="Actores" value={item.actors || item.actores} />
      <Field label="Prioridad" value={item.priority || item.prioridad} />
      <Field label="Precondición" value={item.precondition || item.precondicion || item.precondiciones} />
      <Field label="Poscondición" value={item.postcondition || item.poscondicion || item.poscondiciones} />
      <Field label="Métrica verificable" value={item.metric || item.metrica_medible} />
      <Field label="Cumplimiento" value={item.compliance} />
      <Field label="Origen" value={item.origin || item.origen} />
      {!!criteria.length && <details><summary className="cursor-pointer font-medium">Criterios de aceptación ({criteria.length})</summary>
        <ul className="mt-1 list-disc space-y-1 pl-4">{criteria.map((criterion, i) => <li key={i}>{textOf(criterion) || criterion.descripcion}</li>)}</ul>
      </details>}
      {!!evidence.length ? <details><summary className="cursor-pointer font-medium">Evidencias ({evidence.length})</summary>
        {evidence.map((entry, i) => <div key={i} className="mt-2 border-l-2 border-violet-100 pl-2"><Field label="Fragmento" value={textOf(entry) || entry.texto} /><Field label="Fuente" value={entry.fuente} /></div>)}
      </details> : <Field label="Evidencia" value={item.evidence || item.evidencia} />}
    </div>
  </details>;
}

function Section({ title, entries, children, initialOpen = false }) {
  return <details open={initialOpen || undefined} className="group/section border-b border-slate-200 py-3">
    <summary className="cursor-pointer text-xs font-semibold text-slate-700">{title} <span className="ml-1 font-normal text-slate-400">({entries.length})</span></summary>
    <div className="mt-3 space-y-2">{entries.length ? children : <p className="text-xs text-slate-400">Sin información registrada.</p>}</div>
  </details>;
}

export default function ApprovedRequirementsSidebar({ requirements = {}, audit = {}, onHide, side = 'left' }) {
  const CloseIcon = side === 'right' ? PanelRightClose : PanelLeftClose;
  const functional = requirements?.functional || [];
  const nonFunctional = requirements?.nonFunctional || [];
  const context = [
    ['Reglas de negocio', audit?.reglas_negocio],
    ['Restricciones técnicas y plataformas', audit?.restricciones_tecnicas],
    ['Alcance y decisiones', audit?.decisiones],
    ['Preguntas pendientes', audit?.preguntas_pendientes],
    ['Contexto', audit?.contexto]
  ];
  return <aside id="approved-requirements-sidebar" aria-label="Referencia de requisitos aprobados" data-side={side} className={`absolute inset-y-0 z-30 flex w-[min(85vw,20rem)] shrink-0 flex-col border-slate-200 bg-slate-50 shadow-lg md:relative md:w-80 md:shadow-none ${side === 'right' ? 'right-0 order-last border-l' : 'left-0 border-r'}`}>
    <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-white p-4">
      <div><h2 className="text-sm font-semibold text-slate-900">Requisitos aprobados</h2><p className="mt-1 text-xs text-slate-500">Referencia de solo lectura · {functional.length + nonFunctional.length} requisitos</p></div>
      <button type="button" onClick={onHide} aria-label="Ocultar requisitos aprobados" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><CloseIcon size={18} /></button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      <Section title="Requisitos funcionales" entries={functional} initialOpen>{functional.map((item, i) => <Requirement key={item.id || item.identificador || i} item={item} index={i} prefix="RF" />)}</Section>
      <Section title="Requisitos no funcionales" entries={nonFunctional} initialOpen>{nonFunctional.map((item, i) => <Requirement key={item.id || item.identificador || i} item={item} index={i} prefix="RNF" />)}</Section>
      {context.map(([title, values]) => {
        const entries = Array.isArray(values) ? values : [];
        return <Section key={title} title={title} entries={entries}>{entries.map((entry, i) => <details key={entry.id || i} className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <summary className="cursor-pointer whitespace-pre-wrap break-words font-medium text-slate-800">{textOf(entry) || entry.necesidad || entry.descripcion || entry.contenido || entry.id || 'Elemento del análisis'}</summary>
          <div className="mt-2 space-y-2"><Field label="Identificador" value={entry.id} /><Field label="Estado" value={entry.estado} /><Field label="Objetivo" value={entry.objetivo} /><Field label="Evidencia" value={entry.evidencia} />
            {(Array.isArray(entry.evidencias) ? entry.evidencias : []).map((e, n) => <div key={n}><Field label="Fragmento" value={e.texto} /><Field label="Fuente" value={e.fuente} /></div>)}
          </div>
        </details>)}</Section>;
      })}
    </div>
  </aside>;
}
