import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {cloudConfig} from '../public/cloud-config.js';
import {initialState} from '../public/data.js';
import {setImmediate} from 'node:timers/promises';

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const settle=()=>setImmediate();
async function page({hash='',saved,configured=false,remote}={},run) {
  const {window,document}=parseHTML(html),storage=new Map(saved||[]),intervals=[],originals=new Map();
  const url=new URL(`https://example.test/flatplan/${hash}`);
  const values={window,document,location:url,history:{replaceState(_state,_unused,hash){url.hash=hash;}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    confirm:()=>true,setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval:()=>{},setTimeout:()=>0,
    fetch:async(_url,options)=>{
      const args=JSON.parse(options.body);
      if(_url.endsWith('flatplan_read')) return {ok:true,json:async()=>remote?structuredClone(remote):null};
      if(_url.endsWith('flatplan_write')) {
        if((remote?.revision||0)!==args.p_revision)return {ok:true,json:async()=>({ok:false})};
        remote={state:args.p_state,revision:args.p_revision+1};
        return {ok:true,json:async()=>({ok:true,revision:remote.revision})};
      }
      throw Error('Unexpected URL');
    }
  };
  for(const [key,value] of Object.entries(values)) {originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
  for(const dialog of document.querySelectorAll('dialog')) {
    dialog.showModal=()=>{dialog.open=true;};
    dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};
  }
  const configBefore={...cloudConfig};Object.assign(cloudConfig,{url:configured?'https://example.supabase.co':'',key:configured?'sb_publishable_test':''});
  try {
    await import(`../public/app.js?test=${Math.random()}`);await settle();
    await run({document,window,storage,url,intervals,remote:()=>remote});
  } finally {
    Object.assign(cloudConfig,configBefore);
    for(const [key,descriptor] of originals) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
}

test('local-only mode retains data and clearly reports unavailable sharing',async()=>{
  const state=initialState();state.reserve=39;
  await page({saved:[['flatplan-v1',JSON.stringify(state)]]},async({document})=>{
    assert.match(document.querySelector('#app').textContent,/39 %/);
    assert.equal(document.querySelector('#retry-sync').hidden,true);
    document.querySelector('#share').click();await settle();
    assert.match(document.querySelector('#toast').textContent,/zatím není aktivované/);
  });
});
test('creating share uploads existing edits, keeps local backup and preserves token in navigation',async()=>{
  const state=initialState();state.reserve=37;
  await page({configured:true,saved:[['flatplan-v1',JSON.stringify(state)]]},async({document,storage,url,remote})=>{
    document.querySelector('#share').click();await settle();
    assert.equal(remote().state.reserve,37);
    assert.match(url.hash,/plan=[a-f0-9]{64}/);
    assert.equal(document.querySelector('#share-dialog').open,true);
    assert.match(document.querySelector('#share-link').value,/https:\/\/example.test\/flatplan\/#overview&plan=/);
    for(const link of document.querySelectorAll('a[href^="#"]'))assert.match(link.getAttribute('href'),/plan=[a-f0-9]{64}/);
    assert.equal(JSON.parse(storage.get('flatplan-v1')).reserve,37);
    assert.match(document.querySelector('#save-status').textContent,/Uloženo online/);
  });
});
test('shared link ignores unrelated local plan and edits sync to the server',async()=>{
  const state=initialState();state.reserve=42;
  const local=initialState();local.reserve=87;
  await page({configured:true,hash:`#room/hall&plan=${'d'.repeat(64)}`,saved:[['flatplan-v1',JSON.stringify(local)]],remote:{state,revision:1}},async({document,storage,remote})=>{
    assert.equal(document.querySelector('#app').inert,false);
    const check=document.querySelector('[data-check]');const id=check.dataset.check;check.click();await settle();
    assert.equal(remote().state.tasks.find(t=>t.id===id).status,'done');
    assert.equal(remote().state.reserve,42);assert.equal(JSON.parse(storage.get('flatplan-v1')).reserve,87);
  });
});
test('missing plan stays locked and never uploads default data',async()=>{
  await page({configured:true,hash:`#plan=${'e'.repeat(64)}`},async({document,remote})=>{
    assert.equal(document.querySelector('#app').inert,true);
    assert.equal(document.querySelector('#import').disabled,true);
    assert.match(document.querySelector('#save-status').textContent,/nebyl nalezen/);
    assert.equal(remote(),undefined);
  });
});
test('conflict dialog displays both values and resolves without replacing unrelated changes',async()=>{
  const base=initialState(),local=structuredClone(base),online=structuredClone(base),token='f'.repeat(64);
  local.reserve=23;local.limit=100000;online.reserve=31;
  const saved=[[`flatplan-shared-${token}`,JSON.stringify({state:local,base,revision:1})]];
  await page({configured:true,hash:`#plan=${token}`,saved,remote:{state:online,revision:2}},async({document,remote})=>{
    assert.equal(document.querySelector('#conflict-dialog').open,true);
    assert.match(document.querySelector('#conflict-details').textContent,/Moje: 23/);
    assert.match(document.querySelector('#conflict-details').textContent,/Online: 31/);
    document.querySelector('#conflict-remote').click();await settle();
    assert.equal(remote().state.reserve,31);assert.equal(remote().state.limit,100000);
    assert.equal(document.querySelector('#conflict-dialog').open,false);
    assert.equal(document.querySelector('#app').inert,false);
  });
});
