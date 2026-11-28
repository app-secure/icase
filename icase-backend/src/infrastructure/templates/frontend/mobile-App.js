import React, { useCallback, useEffect, useState } from 'react';
import { Button, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import SpecScreen from './SpecScreen';
import { Action } from './SpecScreen';

const API = process.env.EXPO_PUBLIC_API_URL;
// El generador sustituye los cuatro valores siguientes.
const AUTH = __AUTH__;
const TITLE = __TITLE__;
const SCREENS = __SCREENS__;
// Roles que pueden crear su propia cuenta (el cliente).
const OPEN_ROLES = __REGISTRO__;
const roleKey = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function App() {
  const [token, setToken] = useState(null);
  const [permisos, setPermisos] = useState(null);
  const [credentials, setCredentials] = useState({ email: '', password: '', nombre: '' });
  const [mode, setMode] = useState('login');
  const [notice, setNotice] = useState('');
  const [operation, setOperation] = useState(null);
  const [screen, setScreen] = useState(null);
  const [records, setRecords] = useState([]);
  const [payload, setPayload] = useState('{"valor":""}');
  const [error, setError] = useState('');
  const clearBusinessState = () => { setScreen(null); setOperation(null); setRecords([]); };
  const can = (method) => !AUTH || Boolean(operation && (permisos?.operaciones?.[operation.key] || []).includes(method));
  const allows = useCallback((key, method) => !AUTH || (permisos?.operaciones?.[key] || []).includes(method), [permisos]);
  const visibleScreens = SCREENS.filter((item) => {
    const roles = item.roles || [];
    const allowedRole = !AUTH || !roles.length || roles.some((role) => ['usuario', roleKey(permisos?.rol)].includes(roleKey(role)));
    return allowedRole && (!AUTH || item.operations.some((key) => (permisos?.operaciones?.[key] || []).length));
  });

  // La sesión vive solo en memoria: al cerrar la aplicación hay que volver a iniciar sesión.
  const call = useCallback(async (route, options = {}) => {
    const response = await fetch(API + route, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && AUTH) { setToken(null); setPermisos(null); clearBusinessState(); }
      throw new Error(data.message || 'No se pudo completar la solicitud.');
    }
    return data;
  }, [token]);
  // Avisos de cambios en vivo; sin ese módulo, cada pantalla se actualiza con su botón.
  const subscribe = undefined;

  const load = useCallback(async () => {
    try {
      const contract = await call('/api/contract');
      const current = visibleScreens.find((item) => item.id === screen) || visibleScreens[0];
      if (current && screen !== current.id) setScreen(current.id);
      // Una pantalla construida desde la especificación pide sus propios datos: no usa el listado genérico.
      const first = current?.blocks ? null : contract.operations.find((item) => current?.operations.includes(item.key) && (!AUTH || (permisos?.operaciones?.[item.key] || []).includes('GET')));
      setOperation(first || null);
      const response = first ? await call(first.collectionPath) : [];
      setRecords(Array.isArray(response) ? response : (Array.isArray(response.data) ? response.data : []));
      setError('');
    } catch (failure) { setError(failure.message); }
  }, [call, permisos, screen]);

  useEffect(() => { if (!AUTH || token) load(); }, [token, load]);

  const signIn = async () => {
    setNotice('');
    try {
      const response = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: credentials.email, password: credentials.password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Credenciales inválidas');
      clearBusinessState();
      setPermisos(data.permisos);
      setToken(data.token);
      setError('');
    } catch (failure) { setError(failure.message); }
  };

  const signUp = async () => {
    setNotice('');
    try {
      const response = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: credentials.email, password: credentials.password, nombre: credentials.nombre, rol: OPEN_ROLES[0]?.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'No se pudo crear la cuenta');
      setMode('login'); setError(''); setNotice('Cuenta creada. Ya puedes iniciar sesión.');
    } catch (failure) { setError(failure.message); }
  };

  const create = async () => {
    try { await call(operation.collectionPath, { method: 'POST', body: JSON.stringify(JSON.parse(payload)) }); await load(); } catch (failure) { setError(failure.message); }
  };

  if (AUTH && !token) {
    const registering = mode === 'register';
    return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{TITLE}</Text>
      <Text style={styles.subtitle}>{registering ? 'Crear cuenta' : 'Iniciar sesión'}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.success}>{notice}</Text> : null}
      {registering ? <TextInput style={styles.input} placeholder="Nombre" value={credentials.nombre} onChangeText={(nombre) => setCredentials({ ...credentials, nombre })} /> : null}
      <TextInput style={styles.input} placeholder="Correo electrónico" autoCapitalize="none" keyboardType="email-address" value={credentials.email} onChangeText={(email) => setCredentials({ ...credentials, email })} />
      <TextInput style={styles.input} placeholder="Contraseña (mínimo 8 caracteres)" secureTextEntry value={credentials.password} onChangeText={(password) => setCredentials({ ...credentials, password })} />
      <Action title={registering ? 'Crear cuenta' : 'Iniciar sesión'} onPress={registering ? signUp : signIn} />
      {OPEN_ROLES.length ? <Action title={registering ? 'Ya tengo cuenta' : 'Crear una cuenta'} secondary onPress={() => { setMode(registering ? 'login' : 'register'); setError(''); }} /> : null}
    </ScrollView></SafeAreaView>;
  }

  const current = visibleScreens.find((item) => item.id === screen);
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>{TITLE}</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <View style={styles.menu}>{visibleScreens.map((item) => <Action key={item.id} title={item.name} secondary selected={item.id === screen} onPress={() => setScreen(item.id)} />)}</View>
    {!visibleScreens.length && <Text>No hay pantallas móviles disponibles para este rol.</Text>}
    {current && <Text style={styles.subtitle}>{current.name}</Text>}
    {current?.blocks && <SpecScreen key={current.id} screen={current} call={call} can={allows} subscribe={subscribe} />}
    {current && !current.blocks && <View style={styles.generic}>
      {can('POST') && <TextInput multiline style={styles.input} value={payload} onChangeText={setPayload} />}
      {can('POST') && <Button title="Crear" onPress={create} />}
      {records.map((item, index) => <Text key={item.id || item._id || index}>{JSON.stringify(item)}</Text>)}
    </View>}
    {AUTH && <Button title="Cerrar sesión" onPress={() => { setToken(null); setPermisos(null); clearBusinessState(); }} />}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9' }, body: { padding: 20, gap: 12 }, title: { fontSize: 24, fontWeight: '700' }, subtitle: { fontSize: 19, fontWeight: '700' },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, minHeight: 48 },
  menu: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, generic: { gap: 12 }, error: { color: '#b91c1c' }, success: { color: '#047857', fontWeight: '600' }
});
