import {validateState} from './model.js';

const clone = value => structuredClone(value);
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export const validToken = token => /^[a-f0-9]{64}$/.test(token);
export function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');
}
export function readLocation(hash) {
  const parts = hash.replace(/^#/, '').split('&');
  const plan = parts.find(p=>p.startsWith('plan='));
  return {token: plan ? plan.slice(5) : null, route: parts.find(p=>p && !p.startsWith('plan=')) || 'overview'};
}
export function planHash(route, token) { return `#${route || 'overview'}${token ? `&plan=${token}` : ''}`; }

// Three-way merge by record ID and field, including additions and deletions.
// On conflict the local value is retained until the user explicitly chooses.
export function mergeStates(base, local, remote) {
  const conflicts = [];
  function field(b,l,r,path) {
    if(equal(l,b)) return r;
    if(equal(r,b) || equal(l,r)) return l;
    conflicts.push(path);
    return l;
  }
  const result = {version:1, limit:field(base.limit,local.limit,remote.limit,'limit'), reserve:field(base.reserve,local.reserve,remote.reserve,'reserve')};
  for(const collection of ['tasks','materials','decisions']) {
    const [bm,lm,rm] = [base,local,remote].map(s=>new Map(s[collection].map(v=>[v.id,v])));
    result[collection] = [];
    for(const id of new Set([...rm.keys(),...lm.keys()])) {
      const [b,l,r] = [bm.get(id),lm.get(id),rm.get(id)];
      let item;
      if(!b || !l || !r) item = field(b,l,r,`${collection}/${id}`);
      else {
        item = {id};
        for(const k of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])) {
          if(k !== 'id') item[k] = field(b[k],l[k],r[k],`${collection}/${id}/${k}`);
        }
      }
      if(item) result[collection].push(clone(item));
    }
  }
  return {state:result, conflicts};
}

export function cloudApi(config, fetcher = fetch) {
  const url = new URL(config.url);
  if(url.protocol !== 'https:' || !config.key || config.key.startsWith('sb_secret_')) throw Error('Neplatné nastavení sdílení.');
  async function rpc(name, args) {
    const response = await fetcher(`${url.origin}/rest/v1/rpc/${name}`, {
      method:'POST', headers:{'Content-Type':'application/json', apikey:config.key},
      body:JSON.stringify(args), signal:AbortSignal.timeout(15000), cache:'no-store', referrerPolicy:'no-referrer'
    });
    if(!response.ok) throw Error('Online úložiště není dostupné. Zkus to znovu.');
    return response.json();
  }
  return {
    async read(token) {
      const value = await rpc('flatplan_read', {p_token:token});
      if(!value) throw Error('Plán nebyl nalezen. Ověř sdílecí odkaz.');
      if(!validateState(value.state) || !Number.isSafeInteger(value.revision) || value.revision < 1) throw Error('Online plán má neplatná data.');
      return value;
    },
    async write(token, revision, state) {
      if(!validToken(token) || !validateState(state)) throw Error('Plán má neplatná data.');
      const result = await rpc('flatplan_write',{p_token:token,p_revision:revision,p_state:state});
      if(!result || typeof result.ok !== 'boolean' || (result.ok && (!Number.isSafeInteger(result.revision) || result.revision < 1))) throw Error('Neplatná odpověď úložiště.');
      return result;
    }
  };
}

// One in-flight request per client. Server-side compare-and-swap prevents lost updates.
export class PlanSync {
  constructor({api,token,cached,onState=()=>{},onStatus=()=>{},onCache=()=>{},onConflict=()=>{},paused=()=>false}) {
    Object.assign(this,{api,token,onState,onStatus,onCache,onConflict,paused});
    this.base = cached?.base ? clone(cached.base) : null;
    this.local = cached?.state ? clone(cached.state) : null;
    this.revision = cached?.revision || 0;
    this.busy = false;
    this.conflict = null;
  }
  get dirty() { return this.local && !equal(this.local,this.base); }
  cache() { this.onCache({state:this.local,base:this.base,revision:this.revision}); }
  edit(state) {
    this.local = clone(state);
    this.cache();
    this.onStatus('Změny čekají na online uložení');
  }
  async tick() {
    if(this.busy || this.conflict || this.paused()) return;
    this.busy = true;
    try {
      this.onStatus(this.dirty ? 'Ukládám online…' : 'Ověřuji online plán…');
      const remote = await this.api.read(this.token);
      // An editor may have opened while the request was in flight.
      if(this.paused()) return;
      const merged = this.base ? mergeStates(this.base,this.local,remote.state) : {state:remote.state,conflicts:[]};
      if(merged.conflicts.length) {
        this.conflict = {remote,merged};
        this.onStatus('Souběžná úprava – vyber verzi');
        this.onConflict(merged.conflicts);
        return;
      }
      this.base = clone(remote.state);
      this.revision = remote.revision;
      if(!equal(this.local,merged.state)) { this.local = clone(merged.state); this.onState(clone(this.local)); }
      this.cache();
      if(this.dirty) {
        const sent = clone(this.local);
        const result = await this.api.write(this.token,this.revision,sent);
        if(!result.ok) { this.onStatus('Načítám souběžné změny…'); return; }
        this.base = sent;
        this.revision = result.revision;
        this.cache();
      }
      this.onStatus(this.dirty ? 'Změny čekají na online uložení' : 'Uloženo online · sdílený plán');
    } catch(error) {
      this.onStatus(`${error.message}${this.dirty ? ' Změny čekají v tomto prohlížeči.' : ''}`);
    } finally { this.busy = false; }
  }
  resolve(preferLocal) {
    if(!this.conflict) return;
    const {remote,merged} = this.conflict;
    // Reverse merge chooses remote values only for conflicting fields.
    const next = preferLocal ? merged.state : mergeStates(this.base,remote.state,this.local).state;
    this.base = clone(remote.state); this.revision = remote.revision;
    this.local = clone(next); this.conflict = null;
    this.cache(); this.onState(clone(this.local));
    this.onStatus('Změny čekají na online uložení');
  }
}
