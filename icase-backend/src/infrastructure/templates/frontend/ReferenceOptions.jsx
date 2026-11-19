import React, { useEffect, useState } from 'react';
import { useSession } from './session';

const DATE = /^\d{4}-\d{2}-\d{2}/;
const NAMES = ['nombre', 'name', 'titulo', 'numero', 'codigo', 'descripcion', 'email', 'correo'];
/** Texto con el que se reconoce un registro: su nombre o número; si solo tiene fechas, «#id · fecha»; nunca una fecha ISO en bruto. */
const labelOf = (data, id) => {
  const source = data || {};
  for (const key of NAMES) if (source[key] !== undefined && source[key] !== null && String(source[key]).trim()) return String(source[key]);
  const text = Object.entries(source).find(([key, value]) => key !== 'id' && !key.endsWith('_id') && typeof value === 'string' && value.trim() && !DATE.test(value));
  if (text) return text[1];
  const dated = Object.values(source).find((value) => typeof value === 'string' && DATE.test(value));
  return dated ? `#${id} · ${dated.slice(0, 10)}` : `#${id}`;
};

/**
 * Opciones de un select que referencia a otra entidad: los registros reales del backend (valor = id), no las del mockup.
 * Si la lista no puede leerse, el select queda con su opción vacía.
 */
export default function ReferenceOptions({ operation }) {
  const { api } = useSession();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let alive = true;
    Promise.resolve(api(`/api/operations/${encodeURIComponent(operation)}?limit=100`)).then((response) => {
      if (!alive) return;
      const list = Array.isArray(response) ? response : (response && response.data) || [];
      setRows(list.map((item) => {
        const data = item.data || item;
        const id = item.id ?? item._id ?? data.id;
        return { id: String(id), label: labelOf(data, id) };
      }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [operation, api]);
  return (
    <>
      <option value="">Selecciona…</option>
      {rows.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
    </>
  );
}
