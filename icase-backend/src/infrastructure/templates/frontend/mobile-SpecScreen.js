// Pantalla móvil construida desde la especificación aprobada: cada bloque llama a una operación de negocio con nombre.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { label, enumLabel, money, isMoney, display, pathOf, optionsPath, queryParams, isDateParam, buttonVisible, formFields, isOptional, buildBody, submitLabel, successMessage } from './specFormat';

const METHOD_FOR_PERMISSION = { consulta: 'GET', resumen: 'GET', crear: 'POST', actualizar: 'PATCH', transicion: 'PATCH', eliminar: 'DELETE' };
const permissionOf = (action) => action.permiso || action.capability;
const LABEL_KEYS = ['nombre', 'name', 'titulo', 'numero', 'codigo', 'descripcion'];
const rowLabel = (row) => { for (const key of LABEL_KEYS) if (row[key] !== undefined && row[key] !== null && String(row[key]).trim()) return String(row[key]); return `#${row.id}`; };

export function Action({ title, onPress, disabled, secondary, selected }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(selected) }} disabled={disabled} onPress={onPress}
    style={[styles.button, (secondary && !selected) && styles.secondary, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, (secondary && !selected) && styles.secondaryText]}>{title}</Text>
  </Pressable>;
}

/** Una lista corta de opciones se elige tocándola. */
function Choices({ options, value, onChange }) {
  return <View style={styles.options}>{options.map((option) => <Action key={String(option.value)} title={option.label} secondary selected={String(value) === String(option.value)} onPress={() => onChange(option.value)} />)}</View>;
}

function useOptions(action, name, enabled, call, revision) {
  const [options, setOptions] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    call(optionsPath(action, name)).then((data) => { if (alive) setOptions(Array.isArray(data) ? data : []); }).catch(() => { if (alive) setOptions([]); });
    return () => { alive = false; };
  }, [action, name, enabled, call, revision]);
  return options;
}

/** Fecha y hora en dos campos sencillos; se envían juntas. */
function DateTimeField({ value, onChange }) {
  const [date, time] = String(value || 'T').split('T');
  return <View style={styles.inline}>
    <TextInput style={[styles.input, styles.grow]} placeholder="AAAA-MM-DD" accessibilityLabel="Fecha" value={date} onChangeText={(next) => onChange(`${next}T${time || ''}`)} />
    <TextInput style={[styles.input, styles.grow]} placeholder="HH:MM" accessibilityLabel="Hora" value={time || ''} onChangeText={(next) => onChange(`${date}T${next}`)} />
  </View>;
}

function Field({ action, name, value, onChange, call, revision }) {
  const meta = action.fields?.[name] || {};
  const choosable = (action.opciones || []).includes(name);
  const options = useOptions(action, name, choosable, call, revision);
  const title = `${label(name)}${isMoney(name, meta) ? ' (USD)' : ''}${isOptional(action, name) ? '' : ' *'}`;
  const set = (next) => onChange(name, next);
  let control;
  if (choosable) control = options.length ? <Choices options={options.map((option) => ({ value: option.id, label: option.etiqueta }))} value={value} onChange={set} /> : <Text style={styles.muted}>No hay opciones disponibles por ahora.</Text>;
  else if (meta.enum) control = <Choices options={meta.enum.map((item) => ({ value: item, label: enumLabel(item) }))} value={value} onChange={set} />;
  else if (meta.type === 'boolean') control = <Switch value={Boolean(value)} onValueChange={set} />;
  else if (meta.format === 'date-time') control = <DateTimeField value={value} onChange={set} />;
  else control = <TextInput style={styles.input} accessibilityLabel={label(name)} placeholder={meta.format === 'date' ? 'AAAA-MM-DD' : ''} value={value === undefined ? '' : String(value)}
    keyboardType={meta.type === 'integer' || meta.type === 'number' ? 'numeric' : 'default'} onChangeText={set} />;
  return <View style={styles.field}><Text style={styles.label}>{title}</Text>{control}</View>;
}

/** Los platos del pedido: se tocan para añadirlos y se ajusta la cantidad. */
function Lines({ action, quantities, setQuantities, call, subscribe }) {
  const [options, setOptions] = useState([]);
  const [error, setError] = useState('');
  const spec = action.lineas;
  const load = useCallback(() => call(action.path).then((data) => { setOptions(Array.isArray(data) ? data : []); setError(''); }).catch((failure) => setError(failure.message)), [call, action.path]);
  useEffect(() => { load(); }, [load]);
  const channel = permissionOf(action);
  useEffect(() => (subscribe ? subscribe(channel, load) : undefined), [subscribe, channel, load]);
  const change = (id, delta) => setQuantities((old) => ({ ...old, [id]: Math.max(0, (old[id] || 0) + delta) }));
  const total = options.reduce((sum, row) => sum + (quantities[row.id] || 0) * (Number(row[spec.precio]) || 0), 0);
  return <View style={styles.field}>
    <Text style={styles.label}>{label(spec.destino)}s del pedido *</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {options.map((row) => <View key={row.id} style={styles.line}>
      <View style={styles.grow}><Text>{rowLabel(row)}</Text>{spec.precio ? <Text style={styles.muted}>{money(row[spec.precio])}</Text> : null}</View>
      <Action title="−" secondary disabled={!quantities[row.id]} onPress={() => change(row.id, -1)} />
      <Text style={styles.quantity} accessibilityLabel={`Cantidad de ${rowLabel(row)}`}>{quantities[row.id] || 0}</Text>
      <Action title="+" secondary onPress={() => change(row.id, 1)} />
    </View>)}
    {!options.length && !error ? <Text style={styles.muted}>No hay platos disponibles.</Text> : null}
    {spec.precio ? <Text style={styles.total}>Total estimado: {money(total)}</Text> : null}
  </View>;
}

function Form({ action, fields, call, subscribe, id, initial, onDone, title, submit: preferred }) {
  const given = initial || {};
  const names = formFields(action, fields, given, action.liquida ? [action.liquida.campo] : []);
  const [values, setValues] = useState(given);
  const [quantities, setQuantities] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const submit = async () => {
    const missing = names.find((name) => !isOptional(action, name) && (values[name] === undefined || values[name] === ''));
    if (missing) { setError(`Completa: ${label(missing)}.`); setMessage(''); return; }
    const body = buildBody(action, [...names, ...(action.liquida && given[action.liquida.campo] !== undefined ? [action.liquida.campo] : [])], values);
    if (action.lineas) {
      body.lineas = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([key, quantity]) => ({ [action.lineas.referencia]: key, [action.lineas.cantidad]: quantity }));
      if (!body.lineas.length) { setError('Añade al menos un plato.'); setMessage(''); return; }
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await call(pathOf(action, id), { method: action.method, body: JSON.stringify(body) });
      const done = successMessage(action, result || {});
      setMessage(done);
      if (!id && action.type === 'crear') { setValues(given); setQuantities({}); setRevision((current) => current + 1); }
      onDone?.(done);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  return <View style={styles.block}>
    {names.map((name) => <Field key={name} action={action} name={name} value={values[name]} call={call} revision={revision} onChange={(key, value) => setValues((old) => ({ ...old, [key]: value }))} />)}
    {action.lineas ? <Lines action={action} quantities={quantities} setQuantities={setQuantities} call={call} subscribe={subscribe} /> : null}
    <Action title={busy ? 'Guardando…' : title || submitLabel(action, preferred)} disabled={busy} onPress={submit} />
    {message ? <Text accessibilityLiveRegion="polite" style={styles.success}>{message}</Text> : null}
    {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
  </View>;
}

function Rows({ block, actions, call, can, subscribe }) {
  const action = actions[block.operacion];
  const [query, setQuery] = useState({});
  const [draft, setDraft] = useState({});
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const key = JSON.stringify(query);
  const reload = useCallback(async () => {
    try { const data = await call(pathOf(action, undefined, JSON.parse(key))); setRows(Array.isArray(data) ? data : []); setError(''); } catch (failure) { setError(failure.message); }
  }, [call, action, key]);
  useEffect(() => { reload(); }, [reload]);
  const channel = permissionOf(action);
  useEffect(() => (subscribe ? subscribe(channel, reload) : undefined), [subscribe, channel, reload]);
  const params = queryParams(action);
  const fields = [...(block.campos?.length ? block.campos : action.output || [])];
  if (action.detalle && !fields.includes(action.detalle.campo)) fields.push(action.detalle.campo);
  if (action.detalle && !fields.includes('id')) fields.unshift('id');
  const buttons = (block.acciones || []).map((button) => ({ ...button, def: actions[button.operacion] })).filter((button) => button.def && can(permissionOf(button.def), METHOD_FOR_PERMISSION[button.def.type]));
  const run = async (button, row) => {
    setNotice('');
    if (button.def.type === 'actualizar' || button.def.liquida || button.def.alCambiar) { setEditing(editing === `${row.id}:${button.operacion}` ? null : `${row.id}:${button.operacion}`); return; }
    try { await call(pathOf(button.def, row.id), { method: button.def.method, body: JSON.stringify({}) }); setError(''); setNotice(`${button.etiqueta}: hecho.`); await reload(); } catch (failure) { setError(failure.message); }
  };
  const summary = action.type === 'resumen' || block.tipo === 'kpi';
  return <View style={styles.block}>
    {params.map((name) => <View key={name} style={styles.field}><Text style={styles.label}>{label(name)}</Text><TextInput style={styles.input} placeholder={isDateParam(name) ? 'AAAA-MM-DD' : ''} value={draft[name] || ''} onChangeText={(text) => setDraft((old) => ({ ...old, [name]: text }))} /></View>)}
    {params.length ? <Action title={action.exigeParametro ? 'Buscar' : 'Filtrar'} onPress={() => setQuery(draft)} /> : null}
    <Action title="Actualizar" secondary onPress={reload} />
    {notice ? <Text style={styles.success}>{notice}</Text> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {!rows.length && !error ? <Text style={styles.muted}>{block.tipo === 'kpi' ? 'Todavía no tienes datos aquí.' : 'No hay registros para mostrar.'}</Text> : null}
    {rows.map((row) => <View key={row.id} style={styles.card}>
      {fields.filter((name) => !(summary && (name === 'id' || name.endsWith('_id')) && row[`${name}__etiqueta`] === undefined)).map((name) => (block.tipo === 'kpi'
        ? <View key={name}><Text style={styles.muted}>{label(name)}</Text><Text style={styles.kpi}>{row[name] ?? 0}</Text></View>
        : <Text key={name}><Text style={styles.label}>{name === 'id' ? 'N.º' : label(name)}: </Text>{display(row, name, action.fields?.[name])}</Text>))}
      {buttons.filter((button) => (button.def.byId || button.def.liquida) && buttonVisible(button.def, row)).map((button) => <Action key={`${row.id}-${button.operacion}`} title={button.etiqueta} secondary onPress={() => run(button, row)} />)}
      {editing && editing.startsWith(`${row.id}:`) ? (() => {
        const def = actions[editing.split(':')[1]];
        const initial = def.liquida ? { [def.liquida.campo]: String(row.id) } : def.type === 'actualizar' ? Object.fromEntries((def.inputs || []).filter((name) => row[name] !== undefined).map((name) => [name, row[name]])) : {};
        return <Form action={def} call={call} subscribe={subscribe} id={def.byId ? row.id : undefined} initial={initial} onDone={(done) => { setEditing(null); setNotice(done); reload(); }} />;
      })() : null}
    </View>)}
  </View>;
}

export default function SpecScreen({ screen, call, can, subscribe }) {
  const { blocks = [], actions = {} } = screen;
  return <View style={styles.block}>
    {blocks.map((block, index) => {
      const action = actions[block.operacion];
      if (!action) return null;
      if (!can(permissionOf(action), METHOD_FOR_PERMISSION[action.type])) return <Text key={index}>No tienes permiso para ver esta sección.</Text>;
      if (block.tipo === 'formulario') return <Form key={index} action={action} fields={block.campos} call={call} subscribe={subscribe} submit={block.acciones?.find((item) => item.operacion === block.operacion)?.etiqueta} />;
      return <Rows key={index} block={block} actions={actions} call={call} can={can} subscribe={subscribe} />;
    })}
  </View>;
}

export const styles = StyleSheet.create({
  block: { gap: 10, marginVertical: 4 }, field: { gap: 6 }, inline: { flexDirection: 'row', gap: 8 }, grow: { flex: 1 },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, gap: 6 },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, minHeight: 46 },
  label: { fontWeight: '600', color: '#0f172a' }, muted: { color: '#64748b' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }, quantity: { minWidth: 24, textAlign: 'center', fontWeight: '700' },
  total: { textAlign: 'right', fontWeight: '700' },
  button: { backgroundColor: '#1d4ed8', borderRadius: 8, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center', minWidth: 44 },
  secondary: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1' }, disabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontWeight: '600' }, secondaryText: { color: '#1e293b' },
  success: { color: '#047857', fontWeight: '600' }, error: { color: '#b91c1c' }, kpi: { fontSize: 34, fontWeight: '700' }
});
