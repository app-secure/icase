const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {HttpError}=require('../data/store-support');
function storage(root) {
  let queue=Promise.resolve();
  const file=key=>{if(!/^[a-f0-9]{64}$/.test(key))throw new HttpError(400,'Referencia inválida');return path.join(root,key+'.json');};
  return {
    lock:work=>{const next=queue.then(work);queue=next.catch(()=>{});return next;},
    async get(key){try{return JSON.parse(await fs.readFile(file(key),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}},
    async put(key,value){await fs.mkdir(root,{recursive:true,mode:0o700});if((await fs.readdir(root)).length>10000)throw new HttpError(503,'Límite del almacén de integración');const target=file(key),temp=target+'.'+crypto.randomBytes(8).toString('hex');await fs.writeFile(temp,JSON.stringify(value),{mode:0o600,flag:'wx'});await fs.rename(temp,target);},
    async consume(key){const value=await this.get(key);if(!value)return null;try{await fs.unlink(file(key));return value;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  };
}
module.exports={storage,hash:value=>crypto.createHash('sha256').update(value).digest('hex')};
