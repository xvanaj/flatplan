import {writeFileSync} from 'node:fs';
import {cloudConfig} from '../public/cloud-config.js';
const url=(process.env.FLATPLAN_SUPABASE_URL||'').trim();
const key=(process.env.FLATPLAN_SUPABASE_KEY||'').trim();
if(Boolean(url)!==Boolean(key)) throw Error('Set both FLATPLAN_SUPABASE_URL and FLATPLAN_SUPABASE_KEY.');
if(!url && !key) {
  console.log(cloudConfig.url && cloudConfig.key ? 'Using committed public cloud configuration.' : 'No cloud configuration: local-only mode.');
  process.exit(0);
}
if(url) {
  const parsed=new URL(url);
  if(parsed.protocol!=='https:' || parsed.origin!==url) throw Error('Use the HTTPS Supabase project origin without a trailing slash.');
  if(!key.startsWith('sb_publishable_')) {
    let role;
    try {role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role;} catch {}
    if(role!=='anon') throw Error('Use a public publishable key or legacy anon key, never a secret/service_role key.');
  }
}
writeFileSync('public/cloud-config.js',`// Generated public configuration.\nexport const cloudConfig = ${JSON.stringify({url,key})};\n`);
console.log(url?'Online sharing configuration generated.':'No cloud configuration: local-only mode.');
