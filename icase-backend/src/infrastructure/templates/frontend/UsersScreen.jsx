import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from './session';

const EMPTY = { email: '', nombre: '', password: '', rol: '' };

export default function UsersScreen() {
  const { api, user } = useSession();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([{ id: 'administrador', nombre: 'Administrador' }]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try { setUsers(await api('/api/users')); setError(''); } catch (failure) { setError(failure.message); }
  }, [api]);

  useEffect(() => {
    refresh();
    api('/api/contract').then((contract) => {
      const business = Object.entries(contract.auth?.roles || {}).map(([id, role]) => ({ id, nombre: role.nombre }));
      setRoles([{ id: 'administrador', nombre: 'Administrador' }, ...business]);
      setForm((old) => ({ ...old, rol: old.rol || business[0]?.id || 'administrador' }));
    }).catch(() => {});
  }, [api, refresh]);

  const run = async (action, success) => {
    try { await action(); setMessage(success); setError(''); await refresh(); } catch (failure) { setError(failure.message); setMessage(''); }
  };
  const create = (event) => {
    event.preventDefault();
    run(async () => { await api('/api/users', { method: 'POST', body: JSON.stringify(form) }); setForm({ ...EMPTY, rol: form.rol }); }, 'Usuario creado');
  };
  const patch = (id, changes, success) => run(() => api(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) }), success);
  const remove = (id) => run(() => api(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'Usuario eliminado');

  return <main className="screen" data-screen="usuarios">
    <h1>Usuarios</h1>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status" className="success">{message}</p>}
    <form className="card" onSubmit={create} aria-label="Nuevo usuario">
      <h2>Nuevo usuario</h2>
      <label>Correo electrónico<input className="field" style={{ minHeight: 0 }} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label>Nombre<input className="field" style={{ minHeight: 0 }} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
      <label>Contraseña<input className="field" style={{ minHeight: 0 }} type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      <label>Rol<select className="field" style={{ minHeight: 0 }} value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.nombre}</option>)}</select></label>
      <button className="button" type="submit">Crear usuario</button>
    </form>
    <section className="card">
      <h2>Usuarios registrados</h2>
      {users.map((item) => <article key={item.id} className="record">
        <strong>{item.nombre || item.email}</strong> · {item.email}
        <div>
          <label>Rol <select value={item.rol} disabled={item.id === user?.id} onChange={(e) => patch(item.id, { rol: e.target.value }, 'Rol actualizado')}>{roles.map((role) => <option key={role.id} value={role.id}>{role.nombre}</option>)}</select></label>
          <label> <input type="checkbox" checked={item.activo} disabled={item.id === user?.id} onChange={(e) => patch(item.id, { activo: e.target.checked }, e.target.checked ? 'Usuario activado' : 'Usuario desactivado')} /> Activo</label>
          <button className="button danger" disabled={item.id === user?.id} onClick={() => remove(item.id)}>Eliminar</button>
        </div>
      </article>)}
    </section>
  </main>;
}
