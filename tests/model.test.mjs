import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../public/data.js';
import {summary,validateState,safeUrl} from '../public/model.js';
test('budget counts chosen materials once and excludes alternatives',()=>{const s=initialState();s.tasks[0].price=1000;s.materials=[{price:100,quantity:2,status:'idea',room:'hall'},{price:200,quantity:3,status:'selected',room:'hall'},{price:50,quantity:2,status:'bought',room:'wc'}];assert.equal(summary(s).total,1700);assert.equal(summary(s,'hall').total,1600);assert.equal(summary(s).withReserve,1955);});
test('unknown prices remain distinct from a known zero',()=>{const s=initialState();const n=summary(s).unknown;s.tasks[0].price=0;assert.equal(summary(s).unknown,n-1);});
test('backup validation rejects invalid numbers, executable URLs and duplicate IDs',()=>{const s=initialState();assert.equal(validateState(s),true);s.materials[0].url='javascript:alert(1)';assert.equal(validateState(s),false);s.materials[0].url='';s.tasks[0].price=-1;assert.equal(validateState(s),false);s.tasks[0].price=null;s.tasks.push({...s.tasks[0]});assert.equal(validateState(s),false);assert.equal(safeUrl('data:text/html,test'),null);});
test('backup survives JSON round-trip and rejects broken records',()=>{const s=initialState();s.tasks[0].note='Dohodnuto s řemeslníkem';s.tasks[0].status='doing';s.tasks[0].price=1250.50;assert.deepEqual(JSON.parse(JSON.stringify(s)),s);assert.equal(validateState(JSON.parse(JSON.stringify(s))),true);s.materials.push(null);assert.equal(validateState(s),false);});
