const {HttpError}=require('../data/store-support');
const safe=value=>{const text=String(value??'');return /^[\s]*[=+\-@\t\r]/.test(text)?"'"+text:text;};
const csv=rows=>rows.map(row=>row.map(value=>'"'+safe(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');
async function report(store,operation,scope=null) {
  const rows=[];let bytes=0;
  // El límite es explícito: nunca se entrega un total silenciosamente truncado.
  for(let page=1;page<=101;page++) {
    const result=await store.list(operation.key,{page,limit:100},scope);
    const batch=Array.isArray(result)?result:result.data;
    bytes+=Buffer.byteLength(JSON.stringify(batch));if(bytes>2*1024*1024)throw new HttpError(413,'Reporte excede 2 MiB; se requiere un reporte especializado');
    rows.push(...batch);
    if(rows.length>10000 || result.pagination?.total>10000) throw new HttpError(413,'Reporte excede 10000 registros; se requiere un reporte especializado');
    if(!result.pagination || page>=result.pagination.total_pages) break;
  }
  const columns=Object.entries(operation.schema?.properties||{}).filter(([name])=>!/^password|secret|token/i.test(name));
  const totals={};
  for(const [name,field] of columns) if(['integer','number'].includes(field.type)) {
    const values=rows.map(row=>(row.data||row)[name]).filter(value=>typeof value==='number'&&Number.isFinite(value));
    const sum=values.reduce((a,b)=>a+b,0);
    if(!Number.isFinite(sum)) throw new HttpError(422,'Total fuera de rango');
    totals[name]={count:values.length,sum,average:values.length?sum/values.length:null,min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null};
  }
  return {count:rows.length,totals,columns:columns.map(([name])=>name),rows:rows.map(row=>Object.fromEntries(columns.map(([name])=>[name,(row.data||row)[name]??null]))),consistency:'Lectura paginada; no es un cierre contable ni una instantánea transaccional.'};
}
module.exports={report,csv};
