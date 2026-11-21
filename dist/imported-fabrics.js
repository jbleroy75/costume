import {SUPPLIER_FABRICS} from './supplier-fabric-data.js';
export async function hydrateFabricCatalogue(){
  const ids=new Set(SUPPLIER_FABRICS.map(f=>f.id));
  let cursor='';
  try{
    do{
      const response=await fetch('/api/cloth'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{signal:AbortSignal.timeout(6000)});
      if(!response.ok)return;
      const page=await response.json();
      for(const row of page.rows)if(!ids.has(row.id)){ids.add(row.id);SUPPLIER_FABRICS.push(row);}
      cursor=page.cursor;
    }while(cursor);
  }catch{ /* The bundled catalogue is available offline. */ }
}
