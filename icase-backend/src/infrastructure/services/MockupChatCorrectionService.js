const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[“”«»]/g, '"').replace(/\s+/g, ' ').trim();
const withoutEditIds = html => html.replace(/\sdata-icase-edit-id\s*=\s*("[^"]*"|'[^']*')/gi, '').trim();

/** Verifica la advertencia solicitada sobre el HTML final, no sobre lo que afirma la IA. */
class MockupChatCorrectionService {
  problemas(diagnostico, referencias = null) {
    const enlaces = diagnostico?.enlazado?.enlaces || [];
    return (diagnostico?.advertencias || []).flatMap(mensaje => {
      const faltantes = mensaje.match(/^el formulario de "([^"]+)" no tiene control para: (.*?) \((RF-\d+) /i);
      const desconocido = mensaje.match(/^campo "([^"]+)" de "([^"]+)" no existe en la operación (RF-\d+)/i);
      const problema = {
        mensaje,
        tipo: faltantes ? 'campo_faltante' : desconocido ? 'campo_desconocido' : 'advertencia',
        campo: desconocido?.[1],
        control: faltantes?.[1] || desconocido?.[2] || mensaje.match(/"([^"]+)"/)?.[1] || mensaje.match(/^sin enlace: (.+)$/)?.[1],
        rf: faltantes?.[3] || desconocido?.[3] || mensaje.match(/RF-\d+/i)?.[0]
      };
      const camposFaltantes = faltantes ? faltantes[2].split(',').map(c => c.trim()) : [];
      const indices = enlaces.map((e, i) => normalize(e.control) === normalize(problema.control)
        && (!problema.rf || e.rf === problema.rf)
        && (!faltantes || camposFaltantes.some(c => e.campos_faltantes?.includes(c)))
        && (!desconocido || e.campos_desconocidos?.includes(problema.campo)) ? i : -1).filter(i => i >= 0);
      return (indices.length ? indices : [null]).flatMap(indice => {
        const referencia = indice === null ? normalize(problema.control)
          : referencias ? referencias.get(indice) || `nuevo:${indice}` : `enlace:${indice}`;
        const campos = faltantes ? camposFaltantes.filter(c => indice === null || enlaces[indice].campos_faltantes.includes(c)) : [problema.campo];
        return campos.map(campo => ({
          ...problema, campo, enlace_index: indice,
          id: normalize(`${problema.tipo}|${referencia}|${campo || mensaje.replace(`"${problema.control}"`, '"control"')}`)
        }));
      });
    });
  }

  /** Correspondencia uno a uno: IDs, formulario, operación y campos; el texto es solo una pista. */
  _emparejarEnlaces(anteriores, actuales) {
    const pares = new Map();
    const usados = new Set();
    const compatibles = (a, b) => (a.estado !== 'valido' || (b.estado === 'valido' && a.rf === b.rf && a.verbo === b.verbo))
      && !(a.formulario_id && b.formulario_id && a.formulario_id !== b.formulario_id)
      && !(a.formulario_edicion_id && b.formulario_edicion_id && a.formulario_edicion_id !== b.formulario_edicion_id);
    const estrategias = [
      (a, b) => a.edicion_id && a.edicion_id === b.edicion_id,
      (a, b) => a.formulario_edicion_id && a.formulario_edicion_id === b.formulario_edicion_id && normalize(a.control) === normalize(b.control),
      (a, b) => a.control_id && a.control_id === b.control_id,
      (a, b) => a.formulario_id && a.formulario_id === b.formulario_id && normalize(a.control) === normalize(b.control),
      (a, b) => normalize(a.control) === normalize(b.control),
      (a, b) => a.formulario_id && a.formulario_id === b.formulario_id,
      (a, b) => a.formulario_edicion_id && a.formulario_edicion_id === b.formulario_edicion_id,
      (a, b) => {
        if (a.estado !== 'valido') return false;
        const campos = a.campos.filter(c => !a.campos_desconocidos.includes(c));
        return campos.every(c => b.campos.includes(c));
      }
    ];
    for (const criterio of estrategias) {
      const opciones = new Map();
      anteriores.forEach((a, i) => {
        if (pares.has(i) || !['valido', 'invalido'].includes(a.estado)) return;
        opciones.set(i, actuales.map((b, j) => !usados.has(j) && compatibles(a, b) && criterio(a, b) ? j : -1).filter(j => j >= 0));
      });
      for (const [i, candidatos] of opciones) {
        if (candidatos.length !== 1) continue;
        const j = candidatos[0];
        // Nunca usar un solo formulario como sustituto de dos formularios previos.
        if ([...opciones.values()].filter(list => list.includes(j)).length !== 1) continue;
        pares.set(i, j);
        usados.add(j);
      }
    }
    return pares;
  }

  objetivos(instruccion, diagnostico) {
    const texto = normalize(instruccion);
    const problemas = this.problemas(diagnostico);
    const exactos = problemas.filter(p => texto.includes(normalize(p.mensaje)));
    if (exactos.length) return exactos;
    const tokens = new Set(texto.match(/[a-z0-9_-]+/g) || []);
    const campos = problemas.filter(p => p.campo && tokens.has(normalize(p.campo)));
    const controles = problemas.filter(p => p.control && texto.includes(normalize(p.control)));
    const esCorreccion = /corrig|correg|arregl|repar|solucion|resuelv|advertenc|adverten|aspecto|calidad|enlace|no tiene control|faltant|conviene revisar|problemas que impiden|completa.*control|sin enlace/.test(texto);
    if (!esCorreccion && !campos.length) return [];
    if (campos.length) {
      const especificos = campos.filter(p => controles.includes(p));
      return especificos.length ? especificos : campos;
    }
    if (controles.length) return controles;
    const porRf = problemas.filter(p => p.rf && tokens.has(normalize(p.rf)));
    return porRf.length ? porRf : problemas;
  }

  evaluar({ previo, candidato, diagnosticoPrevio, diagnostico, objetivos = [] }) {
    const reject = motivo => ({ aplicado: false, motivo });
    if (!candidato || candidato.nombre_pantalla !== previo.nombre_pantalla) {
      return reject('La IA no devolvió únicamente la pantalla solicitada.');
    }
    if (!diagnostico?.validacion.valido) {
      return reject(`El HTML propuesto no es válido: ${diagnostico?.validacion.errores.join('; ') || 'respuesta vacía'}`);
    }
    if (withoutEditIds(diagnostico.html) === withoutEditIds(diagnosticoPrevio.html)) {
      return reject('La IA devolvió la pantalla sin cambios.');
    }
    const enlacesPrevios = diagnosticoPrevio.enlazado.enlaces;
    const enlacesActuales = diagnostico.enlazado.enlaces;
    const pares = this._emparejarEnlaces(enlacesPrevios, enlacesActuales);
    const referencias = new Map([...pares].map(([i, j]) => [j, `enlace:${i}`]));
    const pendientes = this.problemas(diagnostico, referencias);
    const idsPendientes = new Set(pendientes.map(p => p.id));
    if (objetivos.length) {
      // Quitar un botón, ocultarlo o convertir su operación en "ui" no repara su formulario.
      for (const [i, anterior] of enlacesPrevios.entries()) {
        if (anterior.estado !== 'valido') continue;
        const actual = enlacesActuales[pares.get(i)];
        if (!actual) return reject(`No se pudo verificar que la propuesta conserve la operación ${anterior.rf}.${anterior.verbo} de "${anterior.control}". Debe mantener ese formulario y sus campos.`);
        const perdidos = anterior.campos.filter(c => !anterior.campos_desconocidos.includes(c) && !actual.campos.includes(c));
        if (perdidos.length) return reject(`Se eliminaron campos existentes de "${anterior.control}": ${perdidos.join(', ')}.`);
      }
      for (const objetivo of objetivos.filter(p => p.control)) {
        const actual = objetivo.enlace_index != null ? enlacesActuales[pares.get(objetivo.enlace_index)]
          : enlacesActuales.find(e => normalize(e.control) === normalize(objetivo.control));
        if (!actual) return reject(`El control "${objetivo.control}" debe seguir visible y corregirse, no eliminarse ni ocultarse.`);
        if (objetivo.tipo === 'campo_faltante' && !actual.en_formulario) {
          return reject(`Los campos y el botón "${objetivo.control}" deben pertenecer al mismo formulario.`);
        }
        if (objetivo.tipo === 'campo_faltante' && !actual.campos.includes(objetivo.campo)) {
          return reject(`El campo "${objetivo.campo}" sigue faltando en el formulario de "${actual.control}".`);
        }
        if (objetivo.tipo === 'campo_desconocido' && actual.campos_desconocidos.includes(objetivo.campo)) {
          return reject(`El campo "${objetivo.campo}" sigue sin existir en la operación ${actual.rf}.`);
        }
      }
      const sinResolver = objetivos.filter(p => idsPendientes.has(p.id));
      if (sinResolver.length) return reject(`La corrección solicitada sigue pendiente: ${[...new Set(sinResolver.map(p => p.mensaje))].join(' | ')}`);
      const anteriores = new Set(this.problemas(diagnosticoPrevio).map(p => p.id));
      const nuevos = pendientes.filter(p => !anteriores.has(p.id));
      if (nuevos.length) return reject(`La propuesta introduce nuevas advertencias: ${[...new Set(nuevos.map(p => p.mensaje))].join(' | ')}`);
    }
    return {
      aplicado: true,
      advertencias_resueltas: [...new Set(objetivos.map(p => p.mensaje))]
        .filter(mensaje => !this.problemas(diagnosticoPrevio).some(p => p.mensaje === mensaje && idsPendientes.has(p.id))),
      advertencias_pendientes: diagnostico.advertencias
    };
  }
}

module.exports = MockupChatCorrectionService;
