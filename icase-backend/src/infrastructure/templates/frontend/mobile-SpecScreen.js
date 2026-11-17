// Pantalla móvil construida desde la especificación aprobada: cada bloque llama a una operación de negocio con nombre.
import React, { useCallback, useEffect, useState } from 'react';
import { Button, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

const METHOD_FOR_PERMISSION = { consulta: 'GET', crear: 'POST', actualizar: 'PATCH', transicion: 'PATCH', eliminar: 'DELETE' };
const humanize = (name) => String(name).replace(/_id$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const shown = (value) => (value === null || value === undefined ? '' : typeof value === 'boolean' ? (value ? 'Sí' : 'No') : typeof value === 'object' ? JSON.stringify(value) : String(value));
const pathOf = (action, id, query) => {
  const base = action.path.replace(':id', encodeURIComponent(id ?? ''));
  const params = Object.entries(query || {}).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  return params ? `${base}?${params}` : base;
};
const parameters = (action) => (action.filters || []).filter((filter) => filter.origen === 'parametro').map((filter) => String(filter.valor));

function Field({ name, meta = {}, value, onChange }) {
  if (meta.type === 'boolean') return <View style={styles.row}><Text>{humanize(name)}</Text><Switch value={Boolean(value)} onValueChange={(next) => onChange(name, next)} /></View>;
  if (meta.enum) {
    return <View><Text style={styles.label}>{humanize(name)}</Text>
      <View style={styles.options}>{meta.enum.map((option) => <Button key={option} title={value === option ? `✓ ${option}` : option} onPress={() => onChange(name, option)} />)}</View></View>;
  }
  const numeric = meta.type === 'integer' || meta.type === 'number';
  return <View><Text style={styles.label}>{humanize(name)}{meta.referencia ? ' (id)' : ''}</Text>
    <TextInput style={styles.input} value={value === undefined ? '' : String(value)} keyboardType={numeric ? 'numeric' : 'default'} onChangeText={(text) => onChange(name, text)} /></View>;
}

function Form({ action, fields, call, id, initial, onDone, title }) {
  const names = fields?.length ? fields : action.inputs;
  const [values, setValues] = useState(initial || {});
  const [message, setMessage] = useState('');
  const submit = async () => {
    const body = Object.fromEntries(names.filter((name) => values[name] !== undefined && values[name] !== '').map((name) => {
      const type = action.fields?.[name]?.type;
      return [name, type === 'integer' || type === 'number' ? Number(values[name]) : values[name]];
    }));
    try { await call(pathOf(action, id), { method: action.method, body: JSON.stringify(body) }); setMessage('Guardado'); if (!id) setValues({}); onDone?.(); } catch (failure) { setMessage(failure.message); }
  };
  return <View style={styles.block}>
    {names.map((name) => <Field key={name} name={name} meta={action.fields?.[name]} value={values[name]} onChange={(key, value) => setValues((old) => ({ ...old, [key]: value }))} />)}
    <Button title={title || humanize(action.name)} onPress={submit} />
    {message ? <Text>{message}</Text> : null}
  </View>;
}

function Rows({ block, actions, call, can }) {
  const action = actions[block.operacion];
  const [query, setQuery] = useState({});
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(null);
  const key = JSON.stringify(query);
  const reload = useCallback(async () => {
    try { const data = await call(pathOf(action, undefined, JSON.parse(key))); setRows(Array.isArray(data) ? data : []); setError(''); } catch (failure) { setError(failure.message); }
  }, [call, action, key]);
  useEffect(() => { reload(); }, [reload]);
  const fields = block.campos?.length ? block.campos : action.output;
  const buttons = (block.acciones || []).map((button) => ({ ...button, def: actions[button.operacion] })).filter((button) => button.def && can(button.def.capability, METHOD_FOR_PERMISSION[button.def.type]));
  const run = async (button, row) => {
    if (button.def.type === 'actualizar') { setEditing(editing === `${row.id}:${button.operacion}` ? null : `${row.id}:${button.operacion}`); return; }
    try { await call(pathOf(button.def, row.id), { method: button.def.method, body: JSON.stringify({}) }); setError(''); await reload(); } catch (failure) { setError(failure.message); }
  };
  return <View style={styles.block}>
    {parameters(action).map((name) => <View key={name}><Text style={styles.label}>{humanize(name)}</Text><TextInput style={styles.input} value={query[name] || ''} onChangeText={(text) => setQuery((old) => ({ ...old, [name]: text }))} /></View>)}
    <Button title="Actualizar" onPress={reload} />
    {buttons.filter((button) => !button.def.byId && button.def.type === 'crear').map((button) => <Button key={button.operacion} title={button.etiqueta} onPress={() => setCreating(creating === button.operacion ? null : button.operacion)} />)}
    {creating ? <Form action={actions[creating]} call={call} onDone={() => { setCreating(null); reload(); }} /> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {!rows.length && !error ? <Text>No hay registros para mostrar.</Text> : null}
    {block.tipo === 'kpi' ? <Text style={styles.kpi}>{rows.length}</Text> : rows.map((row) => <View key={row.id} style={styles.card}>
      {fields.map((name) => <Text key={name}><Text style={styles.label}>{humanize(name)}: </Text>{shown(row[name])}</Text>)}
      {buttons.filter((button) => button.def.byId).map((button) => <Button key={`${row.id}-${button.operacion}`} title={button.etiqueta} onPress={() => run(button, row)} />)}
      {editing && editing.startsWith(`${row.id}:`) ? <Form action={actions[editing.split(':')[1]]} call={call} id={row.id} initial={row} onDone={() => { setEditing(null); reload(); }} /> : null}
    </View>)}
  </View>;
}

export default function SpecScreen({ screen, call, can }) {
  const { blocks = [], actions = {} } = screen;
  return <View>
    {blocks.map((block, index) => {
      const action = actions[block.operacion];
      if (!action) return null;
      if (!can(action.capability, METHOD_FOR_PERMISSION[action.type])) return <Text key={index}>No tienes permiso para ver esta sección.</Text>;
      if (block.tipo === 'formulario') return <Form key={index} action={action} fields={block.campos} call={call} />;
      return <Rows key={index} block={block} actions={actions} call={call} can={can} />;
    })}
  </View>;
}

const styles = StyleSheet.create({
  block: { gap: 8, marginVertical: 8 }, card: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, gap: 6 },
  input: { borderWidth: 1, padding: 10, minHeight: 44 }, label: { fontWeight: '600' }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, error: { color: '#b91c1c' }, kpi: { fontSize: 32, fontWeight: '700' }
});
