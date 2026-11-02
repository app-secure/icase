import React,{useState} from 'react';
import {useSession} from './session';
export default function PaymentRecord({operation,record}) {
  const {api,can}=useSession();const [payment,setPayment]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const start=async()=>{setBusy(true);try{setPayment(await api('/api/integrations/payments/'+encodeURIComponent(operation)+'/'+encodeURIComponent(record.id||record._id),{method:'POST'}));setError('');}catch(failure){setError(failure.message);}finally{setBusy(false);}};
  return <section aria-label="Pago de prueba">{can(operation,'PATCH')&&<button type="button" disabled={busy} onClick={start}>Preparar pago de prueba</button>}
    {payment&&<><p>Estado verificado: {payment.status}. Importe: {payment.amount} {payment.currency} (unidades menores).</p><a href={payment.url} target="_blank" rel="noopener noreferrer">Abrir checkout de prueba</a><button type="button" onClick={async()=>{try{setPayment(await api('/api/integrations/payments/status/'+payment.reference));}catch(failure){setError(failure.message);}}}>Consultar estado del pago</button></>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
