import React, { useCallback, useEffect, useState } from 'react';
import { Button, SafeAreaView, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

const API = process.env.EXPO_PUBLIC_API_URL;
// El generador sustituye los dos valores siguientes.
const AUTH = __AUTH__;
const TITLE = __TITLE__;

export default function App() {
  const [token, setToken] = useState(null);
  const [permisos, setPermisos] = useState(null);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [operation, setOperation] = useState(null);
  const [records, setRecords] = useState([]);
  const [payload, setPayload] = useState('{"valor":""}');
  const [error, setError] = useState('');
  const can = (method) => !AUTH || Boolean(operation && (permisos?.operaciones?.[operation.key] || []).includes(method));

  // La sesión vive solo en memoria: al cerrar la aplicación hay que volver a iniciar sesión.
  const call = useCallback(async (route, options = {}) => {
    const response = await fetch(API + route, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && AUTH) { setToken(null); setPermisos(null); }
      throw new Error(data.message || 'Error');
    }
    return data;
  }, [token]);

  const load = useCallback(async () => {
    try {
      const contract = await call('/api/contract');
      const first = contract.operations.find((item) => !AUTH || (permisos?.operaciones?.[item.key] || []).includes('GET'));
      setOperation(first || null);
      setRecords(first ? await call(first.collectionPath) : []);
      setError('');
    } catch (failure) { setError(failure.message); }
  }, [call, permisos]);

  useEffect(() => { if (!AUTH || token) load(); }, [token, load]);

  const signIn = async () => {
    try {
      const response = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Credenciales inválidas');
      setPermisos(data.permisos);
      setToken(data.token);
      setError('');
    } catch (failure) { setError(failure.message); }
  };

  const create = async () => {
    try { await call(operation.collectionPath, { method: 'POST', body: JSON.stringify(JSON.parse(payload)) }); await load(); } catch (failure) { setError(failure.message); }
  };

  if (AUTH && !token) {
    return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.title}>{TITLE}</Text>
      {error ? <Text>{error}</Text> : null}
      <TextInput style={styles.input} placeholder="Correo electrónico" autoCapitalize="none" keyboardType="email-address" value={credentials.email} onChangeText={(email) => setCredentials({ ...credentials, email })} />
      <TextInput style={styles.input} placeholder="Contraseña" secureTextEntry value={credentials.password} onChangeText={(password) => setCredentials({ ...credentials, password })} />
      <Button title="Iniciar sesión" onPress={signIn} />
    </ScrollView></SafeAreaView>;
  }

  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.body}>
    <Text style={styles.title}>{TITLE}</Text>
    {error ? <Text>{error}</Text> : null}
    {can('POST') && <TextInput multiline style={styles.input} value={payload} onChangeText={setPayload} />}
    {can('POST') && <Button title="Crear" onPress={create} />}
    {records.map((item, index) => <Text key={item.id || item._id || index}>{JSON.stringify(item)}</Text>)}
    {AUTH && <Button title="Cerrar sesión" onPress={() => { setToken(null); setPermisos(null); }} />}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, body: { padding: 20, gap: 12 }, title: { fontSize: 24, fontWeight: '700' }, input: { borderWidth: 1, padding: 12, minHeight: 48 } });
