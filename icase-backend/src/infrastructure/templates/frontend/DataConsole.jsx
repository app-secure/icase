import React from 'react';
import { Link, useParams } from 'react-router-dom';
import OperationScreen from './OperationScreen';

// Consola de datos del administrador: cada operación con su editor genérico (registros, adjuntos, reportes), sin pasar por las pantallas de cada rol.
const operations = __OPERACIONES__;

export default function DataConsole() {
  const { key } = useParams();
  const current = operations.find((operation) => operation.key === key);
  const chooser = <nav aria-label="Operaciones de datos" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '1rem 1.5rem 0' }}>
    {operations.map((operation) => <Link key={operation.key} to={`/datos/${operation.key}`} className={`button${operation.key === key ? '' : ' secondary'}`} style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}>{operation.name}</Link>)}
  </nav>;
  if (!current) return <section className="screen" data-screen="datos"><h1>Datos</h1><p>Elige una operación para ver y editar sus registros.</p>{chooser}</section>;
  return <div>{chooser}<OperationScreen title={current.name} capabilities={[current.key]} /></div>;
}
