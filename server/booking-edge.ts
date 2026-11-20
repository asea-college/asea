const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json;charset=utf-8'}});
const base=Deno.env.get('SUPABASE_URL')!;
const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function rpc(name:string,body:unknown){const r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:secret,'Content-Type':'application/json',...(secret.startsWith('eyJ')?{Authorization:'Bearer '+secret}:{})},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.message||'예약 서버 요청 실패');return d;}
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});try{
 if(req.method==='GET'){const u=new URL(req.url);return json(await rpc(u.searchParams.get('history')==='1'?'tt_booking_history_list':'tt_booking_calendar',{first_day:u.searchParams.get('start'),last_day:u.searchParams.get('end')}));}
 if(req.method!=='POST')return json({error:'지원하지 않는 요청'},405);
 const text=await req.text();if(text.length>3000000)return json({error:'예약은 366개 날짜 이내로 나누어 주세요.'},413);const p=JSON.parse(text);
 if(p.action==='detail')return json(await rpc('tt_booking_detail',{booking_key:p.id}));
 if(p.action==='check'){if(!Array.isArray(p.items)||p.items.length<1||p.items.length>366)throw Error('1~366개 날짜를 선택하세요.');return json({conflicts:await rpc('tt_booking_conflicts',{items:p.items,skip_ids:p.skipIds||[]})});}
 if(p.action==='write'){const d=await rpc('tt_booking_write',{payload:p});return json(d,d.ok===false?409:200);}
 return json({error:'알 수 없는 작업'},400);
 }catch(e){const message=e instanceof Error?e.message:'예약 요청 실패';return json({error:message},/다른 사람이/.test(message)?409:400);}});
