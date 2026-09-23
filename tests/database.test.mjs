import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {initialState} from '../public/data.js';

test('database enforces capability links, validates plans and atomically rejects stale writes',async()=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated;');
    const sql=await readFile(new URL('../supabase/setup.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql); // Repeat installation must preserve existing schema.
    const token='b'.repeat(64),state=initialState();
    const write=async(revision,value=state)=>(await db.query('select public.flatplan_write($1,$2,$3::jsonb) as result',[token,revision,JSON.stringify(value)])).rows[0].result;
    const read=async(value=token)=>(await db.query('select public.flatplan_read($1) as result',[value])).rows[0].result;
    await db.exec('set role anon;');
    assert.deepEqual(await write(0),{ok:true,revision:1});
    assert.deepEqual((await read()).state,state);
    assert.equal(await read('c'.repeat(64)),null);
    assert.deepEqual(await write(0),{ok:false});
    const changed=structuredClone(state);changed.reserve=30;
    assert.deepEqual(await write(1,changed),{ok:true,revision:2});
    assert.deepEqual(await write(1,state),{ok:false});
    assert.equal((await read()).state.reserve,30);
    await assert.rejects(db.query('select * from flatplan_private.plans'),/permission denied/);
    await assert.rejects(db.query('update flatplan_private.plans set state = $1::jsonb',[JSON.stringify(state)]),/permission denied/);
    await assert.rejects(read('short'),/Invalid link/);
    for(const mutate of [
      s=>{s.reserve=-1;},s=>{s.limit='3';},s=>{s.tasks[0].price=-1;},s=>{s.tasks[0].status=null;},
      s=>{s.tasks.push(s.tasks[0]);},s=>{delete s.materials[0].quantity;},s=>{s.materials[0].url='javascript:alert(1)';},s=>{s.decisions=[];}
    ]) {const invalid=structuredClone(state);mutate(invalid);await assert.rejects(write(2,invalid),/Invalid plan/);}
    assert.equal((await read()).revision,2);
    await db.exec('reset role;');
    const rows=(await db.query('select token_hash from flatplan_private.plans')).rows;
    assert.equal(rows.length,1);assert.notEqual(rows[0].token_hash,token);
    await db.exec('set role authenticated;');
    await assert.rejects(read(),/permission denied/);
  } finally {await db.close();}
});
