// Sesión con JWT. El token vive en localStorage: no renderices HTML no confiable en esta aplicación.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const TOKEN_KEY = 'icase_token';
const storage = {
  get() { try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(value) { try { window.localStorage.setItem(TOKEN_KEY, value); } catch { /* almacenamiento no disponible */ } },
  clear() { try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* almacenamiento no disponible */ } }
};

async function request(path, options = {}, token) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [token, setToken] = useState(storage.get);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(storage.get()));

  const logout = useCallback(() => { storage.clear(); setToken(null); setProfile(null); }, []);

  const api = useCallback(async (path, options = {}) => {
    const { response, data } = await request(path, options, token);
    if (response.status === 401 && token) logout(); // sesión caducada, revocada o usuario desactivado
    if (!response.ok) throw Object.assign(new Error(data.message || 'Solicitud fallida'), { status: response.status, details: data.details });
    return data;
  }, [token, logout]);

  useEffect(() => {
    if (!token) { setLoading(false); return undefined; }
    let active = true;
    request('/api/auth/me', {}, token)
      .then(({ response, data }) => { if (!active) return; if (response.ok) setProfile(data); else logout(); })
      .catch(() => { if (active) logout(); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, logout]);

  const login = useCallback(async (email, password) => {
    const { response, data } = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (!response.ok) throw new Error(data.message || 'No se pudo iniciar sesión');
    storage.set(data.token);
    setProfile({ usuario: data.usuario, permisos: data.permisos });
    setToken(data.token);
  }, []);

  const register = useCallback(async (input) => {
    const { response, data } = await request('/api/auth/register', { method: 'POST', body: JSON.stringify(input) });
    if (!response.ok) throw new Error(data.message || 'No se pudo crear la cuenta');
    return data;
  }, []);

  const value = useMemo(() => ({
    loading,
    user: profile ? { ...profile.usuario, administrador: profile.permisos.administrador, nombre_rol: profile.permisos.nombre_rol } : null,
    api,
    can: (operation, method) => (profile?.permisos?.operaciones?.[operation] || []).includes(method),
    login,
    register,
    logout
  }), [loading, profile, api, login, register, logout]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
