import React from 'react';
import { fillFields } from './mockupActions';

const show = (value) => (value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''));
// «fechaHoraLlegadaPrevista» → «Fecha hora llegada prevista»; «cliente_id» → «Cliente».
const heading = (name) => { const text = String(name).replace(/_id$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase(); return text.charAt(0).toUpperCase() + text.slice(1); };
const labelOf = (data, id) => Object.values(data).find((value) => typeof value === 'string' && value.trim()) || String(id);

/**
 * Resultado de una acción del mockup: mensaje y, al consultar, los registros devueltos con un botón para seleccionarlos.
 * Seleccionar rellena el formulario del mockup y fija el registro sobre el que actúan Editar y Eliminar.
 * Sin HTML no confiable.
 */
export default function MockupResult({ result, selected, onSelect, onClose = null, selectable = true }) {
  if (!result && !selected) return null;
  const failed = result?.estado === 'error';
  const records = (result?.registros || []).map((item) => {
    const data = item.data || item;
    const id = item.id ?? item._id ?? data.id;
    return { id, data, view: { id, ...data } };
  });
  const columns = Array.from(new Set(records.flatMap((row) => Object.keys(row.view)))).filter((key) => key !== '_id' && !key.endsWith('__etiqueta'));
  // Una referencia («usuario_id») se muestra con su nombre legible cuando el servidor lo trae.
  const shown = (row, column) => show(row.view[`${column}__etiqueta`] !== undefined ? row.view[`${column}__etiqueta`] : row.view[column]);
  const choose = (event, row) => {
    const scope = event.currentTarget.closest('.mockup-content') || document;
    fillFields(scope, row.data);
    onSelect({ operation: result.operacion, id: String(row.id), etiqueta: labelOf(row.data, row.id), data: row.data });
  };
  const cell = { padding: '0.2rem 0.6rem' };
  return (
    <div data-icase-result role={failed ? 'alert' : 'status'} style={{ margin: '0.75rem 1.5rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid ' + (failed ? '#fecaca' : '#bbf7d0'), background: failed ? '#fef2f2' : '#f0fdf4', color: failed ? '#991b1b' : '#166534', fontSize: '0.875rem' }}>
      {result && <p style={{ margin: 0, display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}><span>{result.mensaje}</span>{onClose && <button type="button" onClick={onClose} aria-label="Cerrar resultado" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'inherit', fontSize: '1rem', lineHeight: 1 }}>×</button>}</p>}
      {failed && Array.isArray(result.detalles) && result.detalles.length > 0 && <ul>{result.detalles.map((detail, index) => <li key={index}>{show(detail)}</li>)}</ul>}
      {selected && (
        <p style={{ margin: '0.4rem 0 0' }}>
          Seleccionado: {selected.etiqueta} (id {selected.id}){' '}
          {onSelect && <button type="button" onClick={() => onSelect(null)} style={{ fontSize: '0.8rem' }}>Quitar selección</button>}
        </p>
      )}
      {records.length > 0 && result.operacion && (
        <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', fontSize: '0.8rem', color: '#0f172a' }}>
          <thead><tr>{columns.map((column) => <th key={column} style={{ ...cell, textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>{heading(column)}</th>)}{selectable && onSelect && <th />}</tr></thead>
          <tbody>{records.map((row, index) => (
            <tr key={row.id ?? index}>
              {columns.map((column) => <td key={column} style={cell}>{shown(row, column)}</td>)}
              {selectable && onSelect && <td style={cell}><button type="button" onClick={(event) => choose(event, row)}>Seleccionar</button></td>}
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
