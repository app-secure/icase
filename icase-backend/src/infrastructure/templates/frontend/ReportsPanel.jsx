import React,{useState} from 'react';
import {useSession} from './session';
export default function ReportsPanel({operation}) {
  const {api}=useSession();const [data,setData]=useState(null),[error,setError]=useState('');
  const run=async format=>{
    try {
      const result=await api('/api/reports/'+encodeURIComponent(operation)+'?format='+format,format==='json'?{}:{responseType:'blob'});
      if(format==='json') setData(result);
      else {const url=URL.createObjectURL(result);const a=document.createElement('a');a.href=url;a.download='reporte.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      setError('');
    } catch(failure){setError(failure.message);}
  };
  return <section aria-label="Reportes"><h3>Reporte de la operación</h3>{['json','csv','pdf'].map(format=><button key={format} onClick={()=>run(format)}>{format==='json'?'Consultar totales':'Exportar '+format.toUpperCase()}</button>)}
    {error&&<p role="alert">{error}</p>}{data&&<><p>Registros: {data.count}</p><pre>{JSON.stringify(data.totals,null,2)}</pre><p>{data.consistency}</p></>}
  </section>;
}
