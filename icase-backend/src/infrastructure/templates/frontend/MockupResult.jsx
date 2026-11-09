import React from 'react';
import { fillFields } from './mockupActions';

const show = (value) => (value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''));
const labelOf = (data, id) => Object.values(data).find((value) => typeof value === 'string' && value.trim()) || String(id);

/**
 * Resultado de una acción del mockup: mensaje y, al consultar, los registros devueltos con un botón para seleccionarlos.
 * Seleccionar rellena el formulario del mockup y fija el registro sobre el que actúan Editar y Eliminar.
 * Sin HTML no confiable.
 */
export default function MockupResult({ result, selected, onSelect }) {
  if (!result && !selected) return null;
  const failed = result?.estado === 'error';
  const records = (result?.registros || []).map((item) => {
    const data = item.data || item;
    const id = item.id ?? item._id ?? data.id;
    return { id, data, view: { id, ...data } };
  });
  const columns = Array.from(new Set(records.flatMap((row) => Object.keys(row.view)))).filter((key) => key !== '_id');
  const choose = (event, row) => {
    const scope = event.currentTarget.closest('.mockup-content') || document;
    fillFields(scope, row.data);
    onSelect({ operation: result.operacion, id: String(row.id), etiqueta: labelOf(row.data, row.id), data: row.data });
  };
  const cell = { padding: '0.2rem 0.6rem' };
  return (
    <div data-icase-result role={failed ? 'alert' : 'status'} style={{ margin: '0.75rem 1.5rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid ' + (failed ? '#fecaca' : '#bbf7d0'), background: failed ? '#fef2f2' : '#f0fdf4', color: failed ? '#991b1b' : '#166534', fontSize: '0.875rem' }}>
      {result && <p style={{ margin: 0 }}>{result.mensaje}</p>}
      {failed && Array.isArray(result.detalles) && result.detalles.length > 0 && <ul>{result.detalles.map((detail, index) => <li key={index}>{show(detail)}</li>)}</ul>}
      {selected && (
        <p style={{ margin: '0.4rem 0 0' }}>
          Seleccionado: {selected.etiqueta} (id {selected.id}){' '}
          {onSelect && <button type="button" onClick={() => onSelect(null)} style={{ fontSize: '0.8rem' }}>Quitar selección</button>}
        </p>
      )}
      {records.length > 0 && onSelect && result.operacion && (
        <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', fontSize: '0.8rem', color: '#0f172a' }}>
          <thead><tr>{columns.map((column) => <th key={column} style={{ ...cell, textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>{column}</th>)}<th /></tr></thead>
          <tbody>{records.map((row, index) => (
            <tr key={row.id ?? index}>
              {columns.map((column) => <td key={column} style={cell}>{show(row.view[column])}</td>)}
              <td style={cell}><button type="button" onClick={(event) => choose(event, row)}>Seleccionar</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
