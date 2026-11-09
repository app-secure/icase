import React from 'react';

const show = (value) => (value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''));

/** Resultado de una acción del mockup: mensaje y, al consultar, los registros devueltos. Sin HTML no confiable. */
export default function MockupResult({ result }) {
  if (!result) return null;
  const failed = result.estado === 'error';
  const rows = (result.registros || []).map((item) => ({ id: item.id ?? item._id, ...(item.data || item) }));
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((key) => key !== '_id');
  return (
    <div data-icase-result role={failed ? 'alert' : 'status'} style={{ margin: '0.75rem 1.5rem', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid ' + (failed ? '#fecaca' : '#bbf7d0'), background: failed ? '#fef2f2' : '#f0fdf4', color: failed ? '#991b1b' : '#166534', fontSize: '0.875rem' }}>
      <p style={{ margin: 0 }}>{result.mensaje}</p>
      {failed && Array.isArray(result.detalles) && result.detalles.length > 0 && <ul>{result.detalles.map((detail, index) => <li key={index}>{show(detail)}</li>)}</ul>}
      {rows.length > 0 && (
        <table style={{ marginTop: '0.5rem', borderCollapse: 'collapse', fontSize: '0.8rem', color: '#0f172a' }}>
          <thead><tr>{columns.map((column) => <th key={column} style={{ textAlign: 'left', padding: '0.2rem 0.6rem', borderBottom: '1px solid #cbd5e1' }}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={row.id ?? index}>{columns.map((column) => <td key={column} style={{ padding: '0.2rem 0.6rem' }}>{show(row[column])}</td>)}</tr>)}</tbody>
        </table>
      )}
    </div>
  );
}
