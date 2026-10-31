import React, { useState } from 'react';
import { useSession } from './session';

// El generador sustituye el marcador siguiente con los roles que admiten registro abierto.
const OPEN_ROLES = __REGISTRO__;

export default function LoginScreen() {
  const { login, register } = useSession();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', nombre: '', rol: OPEN_ROLES[0]?.id || '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'login') await login(form.email, form.password);
      else {
        await register({ email: form.email, password: form.password, nombre: form.nombre, rol: form.rol });
        setMessage('Cuenta creada. Ya puedes iniciar sesión.');
        setMode('login');
      }
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };

  return <main className="screen" data-screen="login">
    <form className="card" onSubmit={submit} aria-label={mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}>
      <h1>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h1>
      {mode === 'register' && <label>Nombre<input className="field" style={{ minHeight: 0 }} value={form.nombre} onChange={update('nombre')} autoComplete="name" /></label>}
      <label>Correo electrónico<input className="field" style={{ minHeight: 0 }} type="email" required value={form.email} onChange={update('email')} autoComplete="username" /></label>
      <label>Contraseña<input className="field" style={{ minHeight: 0 }} type="password" required minLength={8} value={form.password} onChange={update('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
      {mode === 'register' && OPEN_ROLES.length > 1 && <label>Tipo de cuenta<select className="field" style={{ minHeight: 0 }} value={form.rol} onChange={update('rol')}>{OPEN_ROLES.map((role) => <option key={role.id} value={role.id}>{role.nombre}</option>)}</select></label>}
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="success">{message}</p>}
      <button className="button" type="submit" disabled={busy}>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</button>
      {OPEN_ROLES.length > 0 && <button className="button" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Crear una cuenta' : 'Ya tengo cuenta'}</button>}
    </form>
  </main>;
}
