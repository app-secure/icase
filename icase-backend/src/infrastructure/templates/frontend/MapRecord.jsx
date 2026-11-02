import React,{useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {useSession} from './session';
export default function MapRecord({operation,record}) {
  const {api}=useSession();const [config,setConfig]=useState(null),[error,setError]=useState('');const node=useRef(null);
  const fields=record.data||record,lat=config?fields[config.latitude]:null,lng=config?fields[config.longitude]:null;
  useEffect(()=>{
    if(!config||!node.current)return undefined;
    if(typeof lat!=='number'||typeof lng!=='number'||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180){setError('Coordenadas ausentes o fuera de rango');return undefined;}
    const map=L.map(node.current,{attributionControl:false}).setView([lat,lng],13);
    setError('');
    L.tileLayer(config.tile,{maxZoom:19}).addTo(map);L.circleMarker([lat,lng],{radius:8}).addTo(map);
    return ()=>map.remove();
  },[config,lat,lng]);
  return <section aria-label="Mapa del registro"><button type="button" onClick={async()=>{try{setConfig(await api('/api/integrations/maps/'+encodeURIComponent(operation)));setError('');}catch(failure){setError(failure.message);}}}>Mostrar mapa</button>
    {config&&<><div ref={node} aria-label="Mapa" style={{height:260,minWidth:260}}/>{config.attribution&&<small>{config.attribution}</small>}</>}{error&&<p role="alert">{error}</p>}
  </section>;
}
