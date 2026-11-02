const crypto=require('node:crypto');
const read=(files,name)=>{
  const source=files.find(file=>file.ruta===name)?.contenido;
  if(!source) throw new Error('Falta el modelo/migraciones de la versión anterior; no se puede actualizar con seguridad.');
  return JSON.parse(source.trim().replace(/^module\.exports\s*=\s*/,'').replace(/;$/,''));
};
class IncrementalMigrationGenerator {
  apply(files,previous) {
    if(!previous?.archivos?.length) return files;
    const oldModel=read(previous.archivos,'backend/src/data/model.js'),next=read(files,'backend/src/data/model.js');
    if(oldModel.database!==next.database) throw new Error('Cambiar el motor de base de datos requiere migración manual.');
    if(!['postgres','mysql','mongodb'].includes(next.database)) throw new Error('Migraciones incrementales no soportadas en este stack.');
    const oldMigrations=read(previous.archivos,'backend/src/data/migrations.js'), fresh=read(files,'backend/src/data/migrations.js');
    const additions={};const statements=[];
    const q=value=>next.database==='postgres'?'"'+value+'"':'`'+value+'`';
    const types={postgres:{string:'TEXT',integer:'BIGINT',number:'DOUBLE PRECISION',boolean:'BOOLEAN',datetime:'TIMESTAMPTZ',date:'DATE',time:'TIME',uuid:'UUID',json:'JSONB',id:'BIGINT'},mysql:{string:'TEXT',integer:'BIGINT',number:'DOUBLE',boolean:'TINYINT(1)',datetime:'DATETIME(3)',date:'DATE',time:'TIME',uuid:'CHAR(36)',json:'JSON',id:'BIGINT'}};
    for(const [name,old] of Object.entries(oldModel.tables)) {
      const table=next.tables[name];
      if(!table) throw new Error('Eliminar/renombrar tablas requiere migración manual: '+name);
      if(JSON.stringify(old.unique||[])!==JSON.stringify(table.unique||[])) throw new Error('Cambiar índices únicos requiere migración manual: '+name);
      for(const column of old.columns) if(JSON.stringify(table.columns.find(item=>item.column===column.column))!==JSON.stringify(column)) throw new Error('Cambiar/eliminar columnas o referencias requiere migración manual: '+name+'.'+column.column);
      for(const column of table.columns.filter(column=>!old.columns.some(item=>item.column===column.column))) {
        if(column.nullable===false||column.references||column.unique) throw new Error('Agregar columnas obligatorias/referenciadas requiere backfill y migración revisada.');
        if(next.database!=='mongodb') {
          const type=types[next.database][column.type];if(!type)throw new Error('Tipo de columna desconocido');
          statements.push('ALTER TABLE '+q(name)+' ADD COLUMN '+q(column.column)+' '+type);
        }
      }
    }
    for(const [name,table] of Object.entries(next.tables)) if(!oldModel.tables[name]) additions[name]=table;
    // Las sentencias generadas de tablas nuevas conservan índices/referencias; nunca ejecutan DROP.
    if(next.database!=='mongodb') for(const statement of fresh[0].statements) {
      const match=/^(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE) ["`]([^"`]+)["`]| ON ["`]([^"`]+)["`]/.exec(statement);
      if(match&&additions[match[1]||match[2]]) statements.push(statement);
    }
    const authOld=oldMigrations.some(item=>item.id==='0002_auth'),authNew=fresh.find(item=>item.id==='0002_auth');
    if(authOld&&!authNew) throw new Error('Eliminar autenticación requiere una migración manual.');
    if(!authOld&&authNew) throw new Error('Activar autenticación sobre una base existente requiere revisión y migración manual.');
    let incremental=null;
    if(next.database==='mongodb') {
      const indexes=(fresh[0].indexes||[]).filter(index=>additions[index.collection]);
      if(Object.keys(additions).length) incremental={collections:Object.keys(additions),indexes};
    } else if(statements.length) incremental={statements};
    const processIds=['0004_business_process_instances','0005_business_process_locks','0006_business_process_outbox'];
    if(oldMigrations.some(item=>processIds.includes(item.id))&&!fresh.some(item=>item.id==='0004_business_process_instances'))throw new Error('Eliminar procesos de negocio requiere resolver sus instancias y bloqueos mediante migración explícita.');
    const moduleMigrations=fresh.filter(item=>processIds.includes(item.id)&&!oldMigrations.some(old=>old.id===item.id));
    const migrations=[...oldMigrations,...moduleMigrations];
    if(incremental) {
      const number=Math.max(3,...migrations.map(item=>parseInt(item.id,10)||0))+1;
      incremental.id=String(number).padStart(4,'0')+'_alter_'+crypto.createHash('sha256').update(JSON.stringify(incremental)).digest('hex').slice(0,8);
      migrations.push(incremental);
    }
    let result=files.filter(file=>!file.ruta.startsWith('backend/db/migrations/'));
    result.push(...previous.archivos.filter(file=>file.ruta.startsWith('backend/db/migrations/')));
    result.push(...files.filter(file=>moduleMigrations.some(migration=>file.ruta==='backend/db/migrations/'+migration.id+'.sql')));
    const migrationFile=result.find(file=>file.ruta==='backend/src/data/migrations.js');migrationFile.contenido='module.exports = '+JSON.stringify(migrations,null,2)+';\n';
    if(incremental) result.push({ruta:'backend/db/migrations/'+incremental.id+(next.database==='mongodb'?'.json':'.sql'),lenguaje:next.database==='mongodb'?'json':'sql',contenido:next.database==='mongodb'?JSON.stringify(incremental,null,2):incremental.statements.join(';\n')+';\n'});
    const manifest=result.find(file=>file.ruta==='backend/icase.manifest.json');const data=JSON.parse(manifest.contenido);data.storage.migrations=migrations.map(item=>item.id);data.regeneration={previous_version:previous.version,mode:'additive_only',incremental:incremental?.id||null};manifest.contenido=JSON.stringify(data,null,2);
    return result;
  }
}
module.exports=IncrementalMigrationGenerator;
