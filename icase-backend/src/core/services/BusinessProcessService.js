// DSL acotado: nunca SQL, scripts o expresiones ejecutables.
class BusinessProcessService {
  validar(definitions,{operations=[],requirements=[],roles=[]}={}) {
    const errors=[],ids=new Set(),approved=new Set(requirements.filter(r=>r.tipo==='RF'&&r.aprobado!==false).map(r=>r.identificador));
    const fail=message=>{throw new Error(message);};
    if(!Array.isArray(definitions)||definitions.length>20)return {procesos:[],errores:['Los procesos deben ser una lista de hasta 20 definiciones.']};
    const scalar=value=>value===null||typeof value==='boolean'||typeof value==='string'&&value.length<=240||typeof value==='number'&&Number.isFinite(value);
    const keys=(value,allowed)=>{if(Object.keys(value).some(key=>!allowed.includes(key)))fail('Propiedades no admitidas en la definición del proceso.');};
    for(const p of definitions)try{
      if(!p||!/^[a-z][a-z0-9_-]{0,59}$/.test(p.id)||ids.has(p.id))fail('Identificador de proceso inválido o repetido.');ids.add(p.id);
      keys(p,['id','estado_decision','rf','states','initial','terminal','records','start_roles','actions']);
      if(p.estado_decision!=='confirmado')fail(p.id+': confirma explícitamente la definición antes de generar.');
      if(!Array.isArray(p.rf)||!p.rf.length||p.rf.some(r=>!approved.has(r)))fail(p.id+': cita RF aprobados existentes.');
      if(!Array.isArray(p.states)||p.states.length<2||p.states.length>20||p.states.some(s=>typeof s!=='string'||!/^[a-z][a-z0-9_-]{0,39}$/.test(s))||new Set(p.states).size!==p.states.length||!p.states.includes(p.initial))fail(p.id+': estados o estado inicial inválidos.');
      if(!Array.isArray(p.terminal)||!p.terminal.length||p.terminal.some(s=>!p.states.includes(s)||s===p.initial))fail(p.id+': declara estados terminales distintos del inicial.');
      if(!p.records||typeof p.records!=='object'||Array.isArray(p.records)||!Object.keys(p.records).length||Object.keys(p.records).length>10)fail(p.id+': declara entre 1 y 10 registros.');
      for(const [alias,key] of Object.entries(p.records))if(!/^[a-z][a-z0-9_]{0,39}$/.test(alias)||!operations.some(o=>o.key===key))fail(p.id+': registro u operación inexistente.');
      const validRoles=list=>Array.isArray(list)&&list.length>0&&list.every(role=>roles.includes(role));
      if(!validRoles(p.start_roles))fail(p.id+': los roles de inicio deben existir en el acceso aprobado.');
      if(!Array.isArray(p.actions)||!p.actions.length||p.actions.length>30)fail(p.id+': declara entre 1 y 30 acciones.');
      const names=new Set();
      for(const a of p.actions){
        if(!a||!/^[a-z][a-z0-9_-]{0,39}$/.test(a.id)||names.has(a.id))fail(p.id+': acción inválida o repetida.');names.add(a.id);
        keys(a,['id','from','to','roles','different_actor','steps']);
        if(!p.states.includes(a.from)||!p.states.includes(a.to)||a.from===a.to||p.terminal.includes(a.from)||!validRoles(a.roles)||typeof a.different_actor!=='boolean')fail(p.id+': transición, roles o separación de actores inválidos.');
        if(!Array.isArray(a.steps)||a.steps.length>10)fail(p.id+': pasos inválidos (máximo 10).');
        for(const step of a.steps){
          if(!step||typeof step!=='object'||Array.isArray(step))fail(p.id+': paso inválido.');
          keys(step,['record','expect','set']);
          const op=operations.find(o=>o.key===p.records[step?.record]);
          if(!op||!step.set||typeof step.set!=='object'||Array.isArray(step.set)||!Object.keys(step.set).length)fail(p.id+': paso sin registro o cambios explícitos.');
          for(const group of [step.set,step.expect||{}]){
            if(typeof group!=='object'||Array.isArray(group)||Object.keys(group).length>20)fail(p.id+': valores inválidos.');
            for(const [field,value] of Object.entries(group)){
              const schema=op.schema?.properties?.[field];
              if(!schema||schema.readOnly||!scalar(value)||!['string','boolean','number','integer'].includes(schema.type)||value!==null&&(schema.type==='integer'?!Number.isSafeInteger(value):typeof value!==schema.type.replace('integer','number'))||schema.enum&&!schema.enum.includes(value))fail(p.id+': campo o valor incompatible con el contrato aprobado.');
            }
          }
        }
      }
      const reachable=new Set([p.initial]);for(let i=0;i<p.states.length;i++)for(const a of p.actions)if(reachable.has(a.from))reachable.add(a.to);
      if(p.states.some(s=>!reachable.has(s)))fail(p.id+': existen estados inalcanzables.');
      const closable=new Set(p.terminal);for(let i=0;i<p.states.length;i++)for(const a of p.actions)if(closable.has(a.to))closable.add(a.from);
      if(p.states.some(s=>!closable.has(s)))fail(p.id+': existen estados sin camino a cierre.');
    }catch(error){errors.push(error.message);}
    return {procesos:errors.length?[]:JSON.parse(JSON.stringify(definitions)),errores:errors};
  }
}
module.exports=BusinessProcessService;
