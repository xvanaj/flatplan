export function summary(state,room){
 const tasks=state.tasks.filter(t=>!room||t.room===room), materials=state.materials.filter(t=>!room||t.room===room);
 const included=materials.filter(m=>m.status!=='idea');
 const work=tasks.reduce((s,t)=>s+(t.price??0),0), material=included.reduce((s,m)=>s+(m.price??0)*m.quantity,0);
 const total=work+material;
 return {work,material,total,withReserve:Math.round(total*(1+state.reserve/100)*100)/100,unknown:tasks.filter(t=>t.price===null).length+included.filter(m=>m.price===null).length,done:tasks.filter(t=>t.status==='done').length,count:tasks.length};
}
export function safeUrl(value){try {const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}}
export function validateState(s){
 const roomIds=['hall','newbath','oldbath','store','wc','room4','room3','kitchen'];
 const str=v=>typeof v==='string'&&v.length<20000;
 const amount=v=>v===null||(Number.isFinite(v)&&v>=0&&v<=1e10);
 const unique=a=>a.every(x=>x&&typeof x==='object')&&new Set(a.map(x=>x.id)).size===a.length;
 if(!s||s.version!==1||!amount(s.limit)||!Number.isFinite(s.reserve)||s.reserve<0||s.reserve>100) return false;
 if(!Array.isArray(s.tasks)||!Array.isArray(s.materials)||!Array.isArray(s.decisions)||s.tasks.length>5000||s.materials.length>5000)return false;
 if(![s.tasks,s.materials,s.decisions].every(unique))return false;
 return s.tasks.every(t=>str(t.id)&&roomIds.includes(t.room)&&str(t.name)&&str(t.note)&&amount(t.price)&&['todo','doing','done'].includes(t.status)&&['must','later'].includes(t.priority)&&['undecided','pro','self'].includes(t.who))&&s.materials.every(m=>str(m.id)&&roomIds.includes(m.room)&&str(m.name)&&str(m.note)&&str(m.url)&&(!m.url||safeUrl(m.url))&&amount(m.price)&&Number.isFinite(m.quantity)&&m.quantity>0&&m.quantity<=1e8&&str(m.unit)&&['idea','selected','bought'].includes(m.status))&&s.decisions.length===9&&s.decisions.every(d=>/^[0-8]$/.test(d.id)&&typeof d.done==='boolean'&&str(d.note));
}
