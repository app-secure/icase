import React,{useEffect,useState} from 'react';
import {Button,Text,TextInput,View} from 'react-native';
function Relation({relation,record,call,revision,writable}){
 const [target,setTarget]=useState(''),[links,setLinks]=useState([]),[error,setError]=useState('');
 const route='/api/associations/'+encodeURIComponent(relation.table),source=String(record.id||record._id);
 const load=async()=>{try{const result=await call(route+'?'+new URLSearchParams({source_id:source,limit:'50'}));setLinks(result.data||[]);setError(result.has_more?'Se muestran los primeros 50 vínculos; consulta la web para paginar.':'');}catch(failure){setError(failure.message);}};
 useEffect(()=>{load();},[call,route,source,revision]);
 const change=async(method,id=target)=>{try{await call(route,{method,body:JSON.stringify({source_id:source,target_id:String(id)})});await load();}catch(failure){setError(failure.message);}};
 return <View><Text>Vínculos {relation.entities.join(' / ')} de #{source}</Text>{error&&<Text>{error}</Text>}
  {writable&&<><TextInput placeholder="ID del registro destino" value={target} onChangeText={setTarget}/><Button title="Asociar" onPress={()=>change('POST')}/></>}
  {links.map(link=><View key={link.target_id}><Text>Destino #{link.target_id}</Text>{writable&&<Button title={'Desasociar #'+link.target_id} onPress={()=>change('DELETE',link.target_id)}/>}</View>)}
 </View>;
}
export default function Associations({relations,operation,record,call,revision,permissions}){
 const permitted=(relation,method)=>relation.operations.every(group=>group.some(key=>permissions?.operaciones?.[key]?.includes(method)));
 return <View>{relations.filter(relation=>relation.operations?.[0]?.includes(operation.key)&&permitted(relation,'GET')).map(relation=><Relation key={relation.table} relation={relation} record={record} call={call} revision={revision} writable={permitted(relation,'PATCH')}/>)}</View>;
}
