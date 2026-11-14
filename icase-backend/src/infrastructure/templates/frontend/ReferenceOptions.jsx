import React, { useEffect, useState } from 'react';
import { useSession } from './session';

const labelOf = (data, id) => Object.values(data || {}).find((value) => typeof value === 'string' && value.trim()) || String(id);

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
