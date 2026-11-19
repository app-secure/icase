function inlineEnvironment(source,service,values){
  const start=source.indexOf('  '+service+':\n');if(start<0)throw new Error('Servicio de prueba inexistente');
  const next=source.slice(start+3).search(/\n  [a-z_]+:\n/);const end=next<0?source.length:start+3+next;
  const section=source.slice(start,end),match=/    environment: (\{[^\n]*\})/.exec(section);
  if(!match)throw new Error('Entorno de prueba no reconocido');
  const parsed=JSON.parse(match[1].replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*):/g,'$1"$2":'));
  return source.slice(0,start)+section.replace(match[0],'    environment: '+JSON.stringify({...parsed,...values}))+source.slice(end);
}
function exportedEnvironment(source,values){
  const start=source.indexOf('  backend:\n'),end=source.indexOf('\n  frontend:',start);let section=source.slice(start,end);
  if(!section.includes('    environment:\n'))section=section.replace('  backend:\n','  backend:\n    environment:\n');
  for(const [key,value] of Object.entries(values)){
    section=section.replace(new RegExp('^      '+key+':.*\\n','m'),'');
    section=section.replace('    environment:\n','    environment:\n      '+key+': '+JSON.stringify(value)+'\n');
  }
  return source.slice(0,start)+section+source.slice(end);
}
module.exports={inlineEnvironment,exportedEnvironment};
