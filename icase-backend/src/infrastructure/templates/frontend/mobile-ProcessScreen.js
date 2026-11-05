import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

const requestKey = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

export default function ProcessScreen({ api, token }) {
  const [catalog, setCatalog] = useState([]);
  const [definition, setDefinition] = useState('');
  const [recordsText, setRecordsText] = useState('{}');
  const [list, setList] = useState({ data: [], has_more: false });
  const [page, setPage] = useState(1);
  const [instance, setInstance] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);

  const refresh = useCallback(async () => {
    setList(await api('/api/processes/instances?page=' + page));
  }, [api, page]);

  useEffect(() => {
    if (!token) return;
    let current = true;
    api('/api/processes/definitions').then((value) => { if (current) setCatalog(value); }).catch((failure) => { if (current) setError(failure.message); });
    return () => { current = false; };
  }, [api, token]);

  useEffect(() => {
    if (!token) return;
    let current = true;
    api('/api/processes/instances?page=' + page).then((value) => { if (current) setList(value); }).catch((failure) => { if (current) setError(failure.message); });
    return () => { current = false; };
  }, [api, page, token]);

  const open = async (id) => {
    try {
      setInstance(await api('/api/processes/instances/' + encodeURIComponent(id)));
      setError('');
    } catch (failure) { setError(failure.message); }
  };

  const run = async (task) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await task(); await refresh(); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };

  const start = () => run(async () => {
    const records = JSON.parse(recordsText);
    const result = await api('/api/processes/' + encodeURIComponent(definition) + '/instances', { method: 'POST', body: JSON.stringify({ records }) });
    await open(result.id);
    setMessage('Proceso iniciado.');
  });

  const act = (action) => run(async () => {
    const id = instance.id, version = instance.version;
    if (!pending.current || pending.current.id !== id || pending.current.version !== version || pending.current.action !== action) pending.current = { id, version, action, key: requestKey() };
    const { key } = pending.current;
    try {
      await api('/api/processes/instances/' + encodeURIComponent(id) + '/actions', { method: 'POST', body: JSON.stringify({ action, version, key }) });
      pending.current = null;
      await open(id);
      setMessage('Acción confirmada.');
    } catch (failure) { await open(id); throw failure; }
  });

  const reopen = () => run(async () => {
    const id = instance.id, version = instance.version, action = 'reopen';
    if (!pending.current || pending.current.id !== id || pending.current.version !== version || pending.current.action !== action) pending.current = { id, version, action, key: requestKey() };
    const { key } = pending.current;
    try {
      await api('/api/processes/instances/' + encodeURIComponent(id) + '/reopen', { method: 'POST', body: JSON.stringify({ version, key }) });
      pending.current = null;
      await open(id);
      setMessage('Proceso reabierto.');
    } catch (failure) { await open(id); throw failure; }
  });

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Procesos</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.ok}>{message}</Text> : null}
        <Text>Definición</Text>
        <TextInput style={styles.input} value={definition} onChangeText={setDefinition} placeholder={catalog.map((item) => item.id).join(', ') || 'id'} autoCapitalize="none" />
        <Text>Registros JSON</Text>
        <TextInput style={[styles.input, styles.multiline]} multiline value={recordsText} onChangeText={setRecordsText} />
        <Button title="Iniciar" disabled={busy || !definition} onPress={start} />
        <Button title="Actualizar bandeja" disabled={busy} onPress={() => run(refresh)} />
        {list.data.map((item) => (
          <View key={item.id} style={styles.row}>
            <Button title={`${item.definition} · ${item.state}`} onPress={() => open(item.id)} />
          </View>
        ))}
        <View style={styles.row}>
          <Button title="Anterior" disabled={busy || page === 1} onPress={() => setPage((value) => value - 1)} />
          <Text>Página {page}</Text>
          <Button title="Siguiente" disabled={busy || !list.has_more} onPress={() => setPage((value) => value + 1)} />
        </View>
        {instance ? (
          <View style={styles.card}>
            <Text>{instance.definition} · {instance.state} · v{instance.version}</Text>
            {instance.actions.map((action) => <Button key={action} title={`Ejecutar ${action}`} disabled={busy} onPress={() => act(action)} />)}
            {instance.can_reopen ? <Button title="Reabrir proceso" disabled={busy} onPress={reopen} /> : null}
            {instance.history.map((item) => <Text key={item.version}>{item.action}: {item.from} → {item.to}</Text>)}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 20, gap: 10 },
  title: { fontSize: 22, fontWeight: '700' },
  input: { borderWidth: 1, padding: 10, minHeight: 40 },
  multiline: { minHeight: 80 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  card: { gap: 8, marginTop: 12 },
  error: { color: '#b91c1c' },
  ok: { color: '#047857' }
});
