import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../public/data.js';
import {PlanSync,mergeStates,readLocation,planHash,validToken,newToken,cloudApi} from '../public/sync.js';
const copy = value=>structuredClone(value);
const token='a'.repeat(64);
function server(state=initialState()) {
  let data={state:copy(state),revision:1};
  return {
    async read(){return copy(data);},
    async write(_token,revision,state){
      if(revision!==data.revision) return {ok:false};
      data={state:copy(state),revision:revision+1};return {ok:true,revision:data.revision};
    },
    change(fn){fn(data.state);data.revision++;},
    get data(){return copy(data);}
  };
}
function client(api,extra={}) {return new PlanSync({api,token,cached:{state:api.data.state,base:api.data.state,revision:api.data.revision},...extra});}
test('share token survives every route; malformed tokens are rejected',()=>{
  for(const route of ['overview','room/hall','materials','budget']) assert.deepEqual(readLocation(planHash(route,token)),{route,token});
  assert.deepEqual(readLocation(`#plan=${token}`),{route:'overview',token});
  assert.deepEqual(readLocation('#rooms'),{route:'rooms',token:null});
  assert.equal(validToken(newToken()),true);assert.notEqual(newToken(),newToken());
  assert.equal(validToken('short'),false);assert.equal(validToken(''),false);
});
test('different fields on the same record merge without lost changes',()=>{
  const base=initialState(),local=copy(base),remote=copy(base);
  local.tasks[0].price=1500;remote.tasks[0].note='Nabídka';
  const merged=mergeStates(base,local,remote);
  assert.deepEqual(merged.conflicts,[]);assert.equal(merged.state.tasks[0].price,1500);assert.equal(merged.state.tasks[0].note,'Nabídka');
});
test('same field differs: conflict; equal edits: no conflict',()=>{
  const base=initialState(),local=copy(base),remote=copy(base);
  local.tasks[0].price=100;remote.tasks[0].price=200;
  assert.equal(mergeStates(base,local,remote).conflicts.length,1);
  remote.tasks[0].price=100;assert.equal(mergeStates(base,local,remote).conflicts.length,0);
});
test('additions, deletions and delete-vs-edit conflicts are preserved',()=>{
  const base=initialState(),local=copy(base),remote=copy(base),id=base.tasks[0].id;
  local.tasks.shift();remote.tasks.push({...remote.tasks[1],id:'new-task'});
  let merged=mergeStates(base,local,remote);
  assert.equal(merged.state.tasks.some(t=>t.id===id),false);assert.equal(merged.state.tasks.some(t=>t.id==='new-task'),true);
  assert.equal(merged.conflicts.length,0);
  remote.tasks[0].note='Changed before deletion';merged=mergeStates(base,local,remote);
  assert.equal(merged.conflicts.length,1);
});
test('two clients save unrelated edits and converge',async()=>{
  const api=server(),a=client(api),b=client(api),sa=copy(a.local),sb=copy(b.local);
  sa.tasks[0].price=123;sb.tasks[1].note='Jiný člověk';a.edit(sa);b.edit(sb);
  await Promise.all([a.tick(),b.tick()]);await a.tick();await b.tick();await a.tick();
  assert.equal(api.data.state.tasks[0].price,123);assert.equal(api.data.state.tasks[1].note,'Jiný člověk');
  assert.deepEqual(a.local,b.local);assert.equal(a.dirty,false);assert.equal(b.dirty,false);
});
for(const preferLocal of [true,false]) test(`conflict resolution ${preferLocal?'local':'remote'} preserves unrelated edits`,async()=>{
  const api=server(),c=client(api),state=copy(c.local);
  state.tasks[0].price=100;state.reserve=20;c.edit(state);
  api.change(s=>{s.tasks[0].price=200;s.limit=500000;});
  await c.tick();assert.ok(c.conflict);assert.equal(api.data.state.reserve,15);
  c.resolve(preferLocal);await c.tick();
  assert.equal(api.data.state.tasks[0].price,preferLocal?100:200);
  assert.equal(api.data.state.reserve,20);assert.equal(api.data.state.limit,500000);
});
test('offline edits survive cache/reload and retry',async()=>{
  const api=server();let online=false,cache;
  const unreliable={read:()=>{if(!online)throw Error('Offline');return api.read();},write:(...args)=>api.write(...args)};
  const c=client(api,{api:unreliable,onCache:v=>{cache=copy(v);}}),state=copy(c.local);
  state.reserve=22;c.edit(state);await c.tick();assert.equal(c.dirty,true);
  const reloaded=new PlanSync({api:unreliable,token,cached:cache});online=true;await reloaded.tick();
  assert.equal(api.data.state.reserve,22);assert.equal(reloaded.dirty,false);
});
test('editing while a write is in flight retains and subsequently sends newest edits',async()=>{
  const api=server();let release,started;
  const begun=new Promise(r=>{started=r;});
  const delayed={read:()=>api.read(),write:async(...args)=>{started();await new Promise(r=>{release=r;});return api.write(...args);}};
  const c=client(api,{api:delayed}),first=copy(c.local);first.reserve=21;c.edit(first);
  const pending=c.tick();await begun;
  const second=copy(c.local);second.reserve=22;c.edit(second);release();await pending;
  assert.equal(c.local.reserve,22);assert.equal(c.dirty,true);assert.equal(api.data.state.reserve,21);
  c.api=api;await c.tick();assert.equal(api.data.state.reserve,22);assert.equal(c.dirty,false);
});
test('lost write response does not duplicate or lose committed edits',async()=>{
  const api=server(),c=client(api,{api:{read:()=>api.read(),write:async(...args)=>{await api.write(...args);throw Error('Lost response');}}});
  const state=copy(c.local);state.reserve=25;c.edit(state);await c.tick();assert.equal(c.dirty,true);
  c.api=api;await c.tick();assert.equal(c.dirty,false);assert.equal(c.conflict,null);assert.equal(api.data.revision,2);
});
test('open editor defers remote state and network work',async()=>{
  const api=server();let paused=true;
  const c=client(api,{paused:()=>paused});api.change(s=>{s.reserve=35;});
  await c.tick();assert.equal(c.local.reserve,15);paused=false;await c.tick();assert.equal(c.local.reserve,35);
});
test('fresh shared link loads remote state, never the local-only plan',async()=>{
  const api=server();api.change(s=>{s.reserve=44;});let loaded;
  const c=new PlanSync({api,token,onState:s=>{loaded=s;}});await c.tick();
  assert.equal(loaded.reserve,44);assert.equal(c.dirty,false);
});
test('HTTP RPC sends token in body and rejects corrupt remote data',async()=>{
  let request;
  const api=cloudApi({url:'https://project.supabase.co',key:'sb_publishable_test'},async(url,options)=>{
    request={url,options};return {ok:true,json:async()=>({state:{},revision:1})};
  });
  await assert.rejects(api.read(token),/neplatná data/);
  assert.equal(request.url.includes(token),false);assert.equal(JSON.parse(request.options.body).p_token,token);
  assert.equal(request.options.referrerPolicy,'no-referrer');
  await assert.rejects(api.write('bad',0,initialState()));
});
