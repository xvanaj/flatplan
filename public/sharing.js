import {cloudConfig} from './cloud-config.js';
import {PlanSync,cloudApi,newToken,validToken,readLocation,planHash} from './sync.js';
import {validateState} from './model.js';

export function setupSharing({getState,setState,render,toast}) {
  const $ = s=>document.querySelector(s);
  let token = readLocation(location.hash).token, sync = null, timer, creating = false, cacheFailed = false;
  const configured = Boolean(cloudConfig.url && cloudConfig.key);
  const status = text=>{ $('#save-status').textContent = text + (cacheFailed ? ' Místní záloha se nezdařila; stáhni zálohu.' : ''); };
  const lock = value=>{ $('#app').inert=value; $('#import').disabled=value; };
  const cacheKey = ()=>`flatplan-shared-${token}`;
  function writeCache(value) {
    try {localStorage.setItem(cacheKey(),JSON.stringify(value));cacheFailed=false;}
    catch {cacheFailed=true;}
  }
  function readCache() {
    try {
      const value=JSON.parse(localStorage.getItem(cacheKey()));
      if(value && validateState(value.state) && validateState(value.base) && Number.isSafeInteger(value.revision) && value.revision>0) return value;
    } catch { /* Never overwrite the separate local-only plan. */ }
    return null;
  }
  function showLink() {
    const url=new URL(location.href); url.hash=planHash('overview',token);
    $('#share-link').value=url.href; $('#share-dialog').showModal();
  }
  function start(cached) {
    sync=new PlanSync({api:cloudApi(cloudConfig),token,cached,
      onState:state=>{setState(state);render();lock(false);},
      onStatus:status,onCache:writeCache,
      paused:()=>$('#editor').open,
      onConflict:conflicts=>{
        lock(true);
        $('#conflict-count').textContent=`Počet souběžně změněných polí nebo položek: ${conflicts.length}. Ostatní změny se sloučí automaticky.`;
        const list=$('#conflict-details');list.replaceChildren();
        const labels={limit:'Limit rozpočtu',reserve:'Rezerva',price:'Cena',note:'Poznámka',name:'Název',status:'Stav',who:'Kdo provede',priority:'Priorita',room:'Místnost',quantity:'Množství',unit:'Jednotka',url:'Odkaz',done:'Vyřešeno'};
        const display=value=>value===undefined?'Odstraněno':value===null?'Nevyplněno':typeof value==='object'?JSON.stringify(value):String(value);
        for(const path of conflicts) {
          const [collection,...rest]=path.split('/');
          let mine,online,label;
          if(rest.length===0) {mine=sync.local[collection];online=sync.conflict.remote.state[collection];label=labels[collection]||collection;}
          else {
            // IDs from imported backups may themselves contain slashes.
            const records=[...sync.local[collection],...sync.conflict.remote.state[collection]];
            const item=records.find(record=>path===`${collection}/${record.id}`)||records.find(record=>path.startsWith(`${collection}/${record.id}/`));
            const id=item?.id,field=path.slice(`${collection}/${id}`.length+1);
            const localItem=sync.local[collection].find(record=>record.id===id),remoteItem=sync.conflict.remote.state[collection].find(record=>record.id===id);
            mine=field?localItem?.[field]:localItem;online=field?remoteItem?.[field]:remoteItem;
            label=`${item?.name||'Rozhodnutí '+id}${field?' · '+(labels[field]||field):''}`;
          }
          const row=document.createElement('li');
          const heading=document.createElement('strong');heading.textContent=label;
          const values=document.createElement('p');values.textContent=`Moje: ${display(mine)}\nOnline: ${display(online)}`;
          row.append(heading,values);list.append(row);
        }
        $('#conflict-dialog').showModal();
      }
    });
    if(cached) {setState(cached.state);render();lock(false);}
    else lock(true);
    $('#share').textContent='↗ Sdílecí odkaz';
    $('#storage-help').textContent='Kdokoliv s odkazem může plán upravovat.';
    $('#retry-sync').hidden=false;
    void sync.tick();
    timer=setInterval(()=>{if(!document.hidden) void sync.tick();},4000);
  }
  $('#share').onclick=async()=>{
    if(token) {if(validToken(token)) showLink();return;}
    if(!configured) {toast('Sdílení zatím není aktivované. Nejdřív je potřeba připojit online úložiště.');return;}
    if(creating) return;
    if(!confirm('Vytvořit sdílený plán z aktuálních dat? Každý, komu pošleš odkaz, bude moci data číst i upravovat.')) return;
    creating=true;lock(true);$('#share').disabled=true;status('Vytvářím sdílený plán…');
    try {
      const api=cloudApi(cloudConfig), nextToken=newToken(), state=structuredClone(getState());
      const result=await api.write(nextToken,0,state);
      if(!result.ok) throw Error('Sdílený plán se nepodařilo vytvořit. Zkus to znovu.');
      token=nextToken;
      const cached={state,base:state,revision:result.revision};writeCache(cached);
      history.replaceState(null,'',planHash(readLocation(location.hash).route,token));
      render();start(cached);showLink();
    } catch(error) {status(error.message);toast(error.message);}
    finally {creating=false;lock(false);$('#share').disabled=false;}
  };
  $('#copy-share').onclick=async()=>{
    try {await navigator.clipboard.writeText($('#share-link').value);toast('Odkaz zkopírován.');}
    catch {$('#share-link').focus();$('#share-link').select();toast('Označený odkaz zkopíruj ručně.');}
  };
  $('#close-share').onclick=()=>$('#share-dialog').close();
  $('#retry-sync').onclick=()=>void sync?.tick();
  $('#conflict-dialog').addEventListener('cancel',event=>event.preventDefault());
  for(const [id,preferLocal] of [['conflict-local',true],['conflict-remote',false]]) {
    $( `#${id}`).onclick=()=>{sync.resolve(preferLocal);$('#conflict-dialog').close();lock(false);void sync.tick();};
  }
  $('#conflict-backup').onclick=()=>$('#export').click();
  window.addEventListener('online',()=>void sync?.tick());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) void sync?.tick();});
  $('#editor').addEventListener('close',()=>void sync?.tick());
  window.addEventListener('beforeunload',event=>{if(sync?.dirty || creating){event.preventDefault();event.returnValue='';}});
  window.addEventListener('hashchange',()=>{
    if(readLocation(location.hash).token!==token) {clearInterval(timer);location.reload();}
  });
  if(token!==null) {
    lock(true);
    $('#storage-help').textContent='Sdílený plán';
    if(!validToken(token)) status('Sdílecí odkaz není platný.');
    else if(!configured) status('Sdílení zatím není aktivované – chybí připojení úložiště.');
    else {try {start(readCache());}catch(error){status(error.message);}}
  }
  return {
    save() {
      if(token!==null) {if(sync){sync.edit(getState());void sync.tick();}return;}
      try {localStorage.setItem('flatplan-v1',JSON.stringify(getState()));status('Změny uložené v prohlížeči');}
      catch {status('Uložení selhalo – stáhni zálohu');toast('Změny jsou jen v paměti. Stáhni zálohu před zavřením.');}
    }
  };
}
