const { HttpError }=require('./store-support');
function evaluate(node,data,depth=0) {
  if(depth>8) throw new HttpError(422,'Fórmula demasiado compleja');
  let value;
  if(typeof node==='number') value=node;
  else if(node && typeof node.campo==='string') value=data[node.campo];
  else if(node && ['+','-','*','/'].includes(node.op)) {
    const a=evaluate(node.izquierda,data,depth+1),b=evaluate(node.derecha,data,depth+1);
    if(node.op==='/' && b===0) throw new HttpError(422,'División por cero');
    value=node.op==='+'?a+b:node.op==='-'?a-b:node.op==='*'?a*b:a/b;
  }
  if(value!==undefined&&value!==null&&typeof value!=='number')throw new HttpError(400,'El cálculo requiere entradas de tipo numérico');
  if(typeof value!=='number' || !Number.isFinite(value) || Math.abs(value)>1e15) throw new HttpError(422,'El cálculo requiere valores numéricos finitos dentro de rango');
  return value;
}
function derive(rules,body,previous={}) {
  const result={...body};
  for(const rule of rules.filter(rule=>rule.tipo==='calculo')) {
    let value=evaluate(rule.expresion,{...previous,...result});
    if(Number.isInteger(rule.decimales)) value=Number(value.toFixed(rule.decimales));
    result[rule.campo]=value;
  }
  return result;
}
module.exports={evaluate,derive};
