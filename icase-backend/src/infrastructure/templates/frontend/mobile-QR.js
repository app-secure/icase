import React,{useEffect,useState} from 'react';
import {AppState,Button,Text,View} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
export default function QRScanner(){
  const [permission,request]=useCameraPermissions(),[open,setOpen]=useState(false),[text,setText]=useState('');
  useEffect(()=>{const listener=AppState.addEventListener('change',state=>{if(state!=='active')setOpen(false);});return ()=>listener.remove();},[]);
  return <View><Button title={open?'Cerrar cámara':'Escanear QR'} onPress={async()=>{if(open){setOpen(false);return;}const granted=permission?.granted||Boolean((await request()).granted);if(granted)setOpen(true);}}/>
    {open&&<CameraView style={{height:300}} facing="back" barcodeScannerSettings={{barcodeTypes:['qr']}} onBarcodeScanned={result=>{setText(String(result.data).slice(0,2048));setOpen(false);}}/>}
    {permission&&!permission.granted&&<Text>Se necesita permiso de cámara para escanear.</Text>}{text&&<Text>Contenido leído (no validado): {text}</Text>}
  </View>;
}
