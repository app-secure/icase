import React,{useEffect,useRef,useState} from 'react';
import jsQR from 'jsqr';
export default function QRScanner({onRead}) {
  const [open,setOpen]=useState(false),[text,setText]=useState(''),[error,setError]=useState('');const video=useRef(null);
  useEffect(()=>{
    if(!open)return undefined;let active=true,stream,frame;
    const stop=()=>{active=false;cancelAnimationFrame(frame);stream?.getTracks().forEach(track=>track.stop());};
    const hidden=()=>{if(document.hidden)setOpen(false);};document.addEventListener('visibilitychange',hidden);
    (async()=>{try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('La cámara requiere HTTPS y un navegador compatible');
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:640}},audio:false});
      if(!active){stop();return;}video.current.srcObject=stream;await video.current.play();
      const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});let last=0;
      const scan=now=>{
        if(!active)return;
        if(now-last>150&&video.current?.readyState>=2){last=now;canvas.width=640;canvas.height=Math.max(1,Math.round(640*video.current.videoHeight/video.current.videoWidth));context.drawImage(video.current,0,0,canvas.width,canvas.height);const image=context.getImageData(0,0,canvas.width,canvas.height);const code=jsQR(image.data,image.width,image.height);if(code){setText(code.data.slice(0,2048));setOpen(false);return;}}
        frame=requestAnimationFrame(scan);
      };frame=requestAnimationFrame(scan);
    }catch(failure){if(active){setError(failure.message);setOpen(false);}stop();}})();
    return ()=>{document.removeEventListener('visibilitychange',hidden);stop();};
  },[open]);
  return <section aria-label="Lector QR"><button type="button" onClick={()=>{setError('');setOpen(!open);}}>{open?'Cerrar cámara':'Escanear QR'}</button>
    {open&&<video ref={video} muted playsInline style={{maxWidth:480,width:'100%'}} aria-label="Vista de cámara"/>}
    {error&&<p role="alert">{error}</p>}{text&&<><p>Contenido leído (no validado): {text}</p><button type="button" onClick={()=>onRead?.(text)}>Usar como búsqueda</button></>}
  </section>;
}
