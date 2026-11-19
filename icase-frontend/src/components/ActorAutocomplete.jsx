import React, { useId, useState } from 'react';
import { Search, X } from 'lucide-react';
const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export default function ActorAutocomplete({ value = [], onChange, actors = [] }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const selected = Array.isArray(value) ? value.filter(Boolean) : String(value || '').split(',').map(n => n.trim()).filter(Boolean);
  const catalog = actors.filter((a, index, all) => a?.nombre && !['rechazado', 'fuera_de_alcance'].includes(a.estado) && all.findIndex(b => key(b.nombre) === key(a.nombre)) === index);
  const matches = catalog.filter(a => !selected.some(name => key(name) === key(a.nombre)) && [a.nombre, ...(a.alias || [])].some(name => key(name).includes(key(query))));
  const choose = actor => { onChange([...selected, actor.nombre]); setQuery(''); setOpen(false); setActive(-1); };
  return <div className="space-y-1">
    <label htmlFor={id} className="text-[11px] font-semibold text-slate-600">Actores</label>
    {!!selected.length && <div className="flex flex-wrap gap-1.5 pb-1">{selected.map((name, index) => <span key={`${name}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-violet-100 px-2 py-1 text-xs text-violet-800">
      <span className="break-words">{name}</span><button type="button" aria-label={`Quitar actor ${name}`} onClick={() => onChange(selected.filter((_, i) => i !== index))} className="cursor-pointer rounded-full p-0.5 hover:bg-violet-200"><X size={12} aria-hidden="true" /></button>
    </span>)}</div>}
    <div className="relative">
      <Search size={15} aria-hidden="true" className="pointer-events-none absolute right-3 top-2.5 text-slate-400" />
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && active >= 0 && matches[active] ? `${id}-option-${active}` : undefined} autoComplete="off" placeholder="Buscar actor por nombre…" value={query}
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-xs text-slate-800 outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-violet-100"
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }} onChange={e => { setQuery(e.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={e => {
          if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setActive(-1); }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive(i => matches.length ? (i + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length : -1); }
          if (e.key === 'Enter') { e.preventDefault(); if (open && matches.length) choose(matches[active >= 0 ? active : 0]); }
        }} />
      {open && <div id={`${id}-list`} role="listbox" aria-label="Actores sugeridos" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-violet-100 bg-white p-1 shadow-lg">
        {matches.length ? matches.map((actor, index) => <div key={actor.nombre} id={`${id}-option-${index}`} role="option" aria-selected={index === active} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(actor)} className={`cursor-pointer rounded-lg px-3 py-2 text-xs ${index === active ? 'bg-violet-50 text-violet-800' : 'text-slate-700'}`}>
          {actor.nombre}{actor.estado === 'pendiente' && <span className="ml-2 text-amber-700">Pendiente de confirmar</span>}
        </div>) : <p className="px-3 py-2 text-xs text-slate-500">{!catalog.length ? 'No hay actores registrados. Añádelos en el análisis inicial.' : !query.trim() ? 'Todos los actores disponibles ya están seleccionados.' : 'No hay actores que coincidan.'}</p>}
      </div>}
    </div>
  </div>;
}
