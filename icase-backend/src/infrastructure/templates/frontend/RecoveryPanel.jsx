import React,{useState} from 'react';
export default function RecoveryPanel() {
  const [token,setToken]=useState(()=>{
    const value=new URLSearchParams(window.location.hash.slice(1)).get('reset')||'';
    if(value) history.replaceState(null,'',window.location.pathname+window.location.search);
    return value;
  });
  const [open,setOpen]=useState(Boolean(token)),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const submit=async event=>{
    event.preventDefault();setBusy(true);
    try{
      const response=await fetch('/api/auth/'+(token?'reset-password':'forgot-password'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(token?{token,password}:{email})});
      const result=await response.json();setMessage(result.message||'Solicitud fallida');if(response.ok&&token){setToken('');setPassword('');}
    }catch{setMessage('No se pudo conectar al servidor');}finally{setBusy(false);}
  };
  return <section><button type="button" onClick={()=>setOpen(!open)}>Recuperar contraseña</button>{open&&<form onSubmit={submit} aria-label="Recuperar contraseña">
    {token?<label>Nueva contraseña<input type="password" minLength={8} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></label>:<label>Correo de recuperación<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>}
    <button disabled={busy}>Enviar recuperación</button><p aria-live="polite">{message}</p>
  </form>}</section>;
}
