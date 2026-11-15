import React, { useEffect, useId, useState } from 'react';
import { Plus, Search } from 'lucide-react';

const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export default function ObjectiveAutocomplete({ value = '', onChange, inventory = [], type, invalid, describedBy }) {
  const id = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => { if (value) setQuery(value); }, [value]);
  const goals = new Map();
  inventory.filter(item => item.objetivo_id && item.tipo === type && !['rechazado', 'fuera_de_alcance'].includes(item.estado)).forEach(item => {
    const names = goals.get(item.objetivo_id) || []; names.push(item.necesidad); goals.set(item.objetivo_id, names);
  });
  const reserved = new Set(inventory.map(item => item.objetivo_id).filter(Boolean));
  const nextId = `O-${String(Math.max(0, ...[...reserved].map(key => Number(key.match(/^O-([0-9]+)$/)?.[1]) || 0)) + 1).padStart(2, '0')}`;
  const typed = query.trim().toUpperCase();
  const newId = /^O-[0-9]+$/.test(typed) && !reserved.has(typed) ? typed : nextId;
  const options = [...goals].filter(([key, descriptions]) => normalized(`${key} ${descriptions.join(' ')}`).includes(normalized(query))).map(([key, descriptions]) => ({ id: key, label: descriptions.join(' · ') }));
  if (!options.length || !query.trim()) options.push({ id: newId, create: true });
  const choose = option => { onChange(option.id); setQuery(option.id); setOpen(false); setActive(-1); };
  return <span className="relative mt-1 block font-normal">
    <input role="combobox" name="objetivo_id" autoComplete="off" aria-expanded={open} aria-autocomplete="list" aria-controls={id} aria-invalid={invalid} aria-describedby={describedBy} aria-activedescendant={open && active >= 0 && options[active] ? `${id}-${active}` : undefined} value={query} placeholder="Buscar objetivo por ID o contenido…" className="block w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-10 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" onFocus={() => { setOpen(true); setActive(-1); }} onBlur={() => setOpen(false)} onChange={event => { setQuery(event.target.value); onChange(''); setOpen(true); setActive(-1); }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length); }
      if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0) choose(options[active]); else if (options.length === 1) choose(options[0]); }
    }} />
    <Search size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-3 text-slate-400" />
    {open && <span id={id} role="listbox" aria-label="Objetivos sugeridos" className="absolute inset-x-0 top-full z-20 mt-1 block max-h-52 overflow-y-auto overscroll-contain rounded-xl border border-violet-100 bg-white p-1 shadow-lg">
      {options.map((option, index) => <span key={option.id} id={`${id}-${index}`} role="option" aria-selected={active === index} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(option)} className={`block cursor-pointer rounded-lg px-3 py-2 text-sm ${active === index ? 'bg-violet-50 text-violet-800' : 'text-slate-700'}`}>
        <span className="flex items-center gap-2 font-semibold">{option.create && <Plus size={14} />}{option.create ? `Crear objetivo nuevo · ${option.id}` : option.id}</span>
        <span className="block break-words text-xs text-slate-500">{option.create ? 'El contenido de la necesidad describirá este objetivo al guardar.' : option.label}</span>
      </span>)}
    </span>}
  </span>;
}
