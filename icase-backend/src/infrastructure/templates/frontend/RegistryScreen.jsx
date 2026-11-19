import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import OperationScreen from './OperationScreen';
import { useSession } from './session';

// Pantalla de registros de una operación: tabla con alta, modificación y baja según lo que el rol puede hacer. Complementa las pantallas del diseño
// con el listado que el árbol de navegación no trajo.
const operations = __OPERACIONES__;

export default function RegistryScreen() {
  const { key } = useParams();
  const { can } = useSession();
  const current = operations.find((operation) => operation.key === key);
  if (!current || !can(current.key, 'GET')) return <Navigate to="/" replace />;
  return <div style={{ padding: '20px' }}><OperationScreen title={current.label} capabilities={[current.key]} /></div>;
}
