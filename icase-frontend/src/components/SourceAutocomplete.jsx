import React, { useId, useState } from 'react';
import { Search } from 'lucide-react';

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export default function SourceAutocomplete({ value = '', onChange, sources = [] }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const names = [...new Set(sources.map(source => typeof source === 'string' ? source : source.name || source.nombre_archivo).filter(Boolean))];
  const matches = names.filter(name => normalize(name).includes(normalize(value)));
  const select = name => { onChange(name); setOpen(false); setActive(-1); };
  return <span className="relative mt-1 block font-normal">
    <span className="pointer-events-none absolute right-3 top-3 text-slate-400"><Search size={16} aria-hidden="true" /></span>
    <input role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id} aria-activedescendant={open && active >= 0 && matches[active] ? `${id}-${active}` : undefined} autoComplete="off" value={value} placeholder="Buscar insumo por nombre…" className="block w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-10 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" onFocus={() => { setOpen(true); setActive(-1); }} onBlur={() => { setOpen(false); setActive(-1); }} onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => matches.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length : -1); }
      if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0 && matches[active]) select(matches[active]); }
    }} />
    {open && <span id={id} role="listbox" aria-label="Insumos sugeridos" className="absolute left-0 right-0 top-full z-20 mt-1 block max-h-48 overflow-y-auto overscroll-contain rounded-xl border border-violet-100 bg-white p-1 shadow-lg">
      {matches.length ? matches.map((name, index) => <span key={name} id={`${id}-${index}`} role="option" aria-selected={index === active} onMouseDown={event => event.preventDefault()} onClick={() => select(name)} onMouseEnter={() => setActive(index)} className={`block cursor-pointer break-words rounded-lg px-3 py-2 text-sm ${index === active ? 'bg-violet-50 text-violet-800' : 'text-slate-700'}`}>{name}</span>) : <span className="block px-3 py-2 text-xs text-slate-500">{names.length ? 'No hay insumos que coincidan.' : 'No hay archivos cargados en este proyecto.'}</span>}
    </span>}
  </span>;
}
