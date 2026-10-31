// Sin autenticación (decisión aprobada en la etapa de control de acceso): todo está permitido.
import React, { createContext, useContext } from 'react';

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || 'Solicitud fallida'), { status: response.status, details: data.details });
  return data;
}

const session = { user: null, loading: false, api, can: () => true, login: async () => {}, register: async () => {}, logout: () => {} };
const SessionContext = createContext(session);

export function SessionProvider({ children }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
