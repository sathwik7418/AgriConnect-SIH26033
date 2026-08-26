const https = require('https');
const fs = require('fs');
const { query } = require('./db');

const API_BASE = 'https://api.agmarknet.gov.in/v1';
const LOG = '/Users/vamshi/SIH26033/backend/import-bg.log';

const STATES = [
  { id: 34, name: 'Uttar Pradesh' },   { id: 20, name: 'Maharashtra' },
  { id: 19, name: 'Madhya Pradesh' },  { id: 16, name: 'Karnataka' },
  { id: 11, name: 'Gujarat' },         { id: 2,  name: 'Andhra Pradesh' },
  { id: 32, name: 'Telangana' },       { id: 28, name: 'Punjab' },
  { id: 12, name: 'Haryana' },         { id: 5,  name: 'Bihar' },
  { id: 36, name: 'West Bengal' },     { id: 31, name: 'Tamil Nadu' },
  { id: 29, name: 'Rajasthan' },       { id: 26, name: 'Odisha' },
  { id: 7,  name: 'Chattisgarh' },
];
const COMMODITIES = [
  { id: 23, name: 'ONION' },          { id: 24, name: 'POTATO' },
  { id: 65, name: 'TOMATO' },         { id: 1,  name: 'WHEAT' },
  { id: 2,  name: 'PADDY(COMMON)' },  { id: 3,  name: 'RICE' },
  { id: 4,  name: 'MAIZE' },          { id: 10, name: 'GROUNDNUT' },
  { id: 13, name: 'SOYABEAN' },       { id: 15, name: 'COTTON' },
  { id: 19, name: 'BANANA' },         { id: 32, name: 'BRINJAL' },
];

function log(m){ const l=`[${new Date().toISOString()}] ${m}`; console.log(l); fs.appendFileSync(LOG,l+'\n'); }
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function httpGet(url){
  return new Promise(resolve=>{
    const req = https.get(url,{timeout:35000,agent:false},res=>{
      let b=''; res.on('data',c=>b+=c);
      res.on('end',()=>resolve({status:res.statusCode,body:b}));
    });
    req.on('error',()=>resolve({status:0,body:''}));
    req.on('timeout',()=>{req.destroy();resolve({status:0,body:''});});
  });
}

async function fetchJSON(url){
  for(let a=0;a<6;a++){
    const {status,body}=await httpGet(url);
    if(status===200){ try{ return JSON.parse(body);}catch{return null;} }
    if(status===429||status>=500||status===0){ stats.retries++; await sleep(Math.min(45000,1500*Math.pow(2,a))+Math.random()*500); continue; }
    return null;
  }
  stats.gaveUp++; return null;
}

function parseDDMMYYYY(s){
  if(!s)return null;
  const p=s.split('/');
  if(p.length===3){ const d=+p[0],m=+p[1],y=+p[2];
    if(d&&m&&y>=2008&&y<=2022) return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  return null;
}

const stats={ok:0,empty:0,retries:0,gaveUp:0,inserted:0};

async function processTask(t){
  const url=`${API_BASE}/prices-and-arrivals/date-wise/specific-commodity?year=${t.y}&month=${t.m}&stateId=${t.s.id}&commodityId=${t.c.id}`;
  const r=await fetchJSON(url);
  if(!r){stats.empty++;return;}
  const mkts=r.markets||[];
  if(mkts.length===0){stats.empty++;return;}
  stats.ok++;
  for(const mkt of mkts){
    const mn=mkt.marketName||'', dist=mkt.district||'';
    for(const de of (mkt.dates||[])){
      const ds=parseDDMMYYYY(de.arrivalDate); if(!ds)continue;
      // Prices live inside de.data[] — one entry per variety
      for(const row of (de.data||[de])){
        const mnP=parseFloat(row.minimumPrice||row.min_price||0);
        const mxP=parseFloat(row.maximumPrice||row.max_price||0);
        const mdP=parseFloat(row.modalPrice||row.modal_price||0);
        if(mnP<=0&&mxP<=0&&mdP<=0)continue;
        try{
          const res=await query(
            `INSERT INTO historical_market_prices (state,district,market,commodity,variety,grade,arrival_date,min_price,max_price,modal_price,source,fetched_at,data_period)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'agmarknet_historical',NOW(),'agmarknet_2008_2022')
             ON CONFLICT (state,district,market,commodity,arrival_date) DO NOTHING`,
            [t.s.name,dist,mn,t.c.name,row.variety||de.variety||null,null,ds,mnP,mxP,mdP]);
          if(res.rowCount>0)stats.inserted++;
        }catch{}
      }
    }
  }
}

// Priority core: 5 staples x 6 biggest states; then expands automatically
function buildTasks(){
  const coreS=STATES.slice(0,6), coreC=COMMODITIES.slice(0,5);
  const t=[];
  for(const c of coreC) for(const s of coreS)
    for(let y=2008;y<=2022;y++) for(let m=1;m<=12;m++) t.push({s,c,y,m});
  for(const c of COMMODITIES.slice(5)) for(const s of coreS)
    for(let y=2008;y<=2022;y++) for(let m=1;m<=12;m++) t.push({s,c,y,m});
  for(const c of COMMODITIES) for(const s of STATES.slice(6))
    for(let y=2008;y<=2022;y++) for(let m=1;m<=12;m++) t.push({s,c,y,m});
  return t;
}

async function main(){
  log('=== Import v4: 35s timeout, priority core first, auto-expand ===');
  const tasks=buildTasks();
  log(`Total tasks: ${tasks.length}`);
  let done=0;
  for(const t of tasks){
    await processTask(t);
    done++;
    await sleep(400);
    if(done%50===0) log(`${done}/${tasks.length} | ok=${stats.ok} empty=${stats.empty} inserted=${stats.inserted} retries=${stats.retries} gaveup=${stats.gaveUp} | last ${t.c.name}/${t.s.name}/${t.y}-${t.m}`);
    if(done===10) log(`after 10 tasks: inserted=${stats.inserted} retries=${stats.retries}`);
  }
  log(`=== ALL DONE | ok=${stats.ok} empty=${stats.empty} inserted=${stats.inserted} ===`);
  const v=await query(`SELECT COUNT(*)::int n, MIN(arrival_date)::text mn, MAX(arrival_date)::text mx FROM historical_market_prices`);
  log(`DB TOTAL: ${v.rows[0].n} | ${v.rows[0].mn} -> ${v.rows[0].mx}`);
  (await query(`SELECT EXTRACT(YEAR FROM arrival_date)::int yr,COUNT(*)::int c FROM historical_market_prices GROUP BY 1 ORDER BY 1`)).rows.forEach(r=>log(`YEAR ${r.yr}: ${r.c}`));
  (await query(`SELECT state,COUNT(*)::int c FROM historical_market_prices GROUP BY 1 ORDER BY 2 DESC`)).rows.forEach(r=>log(`STATE ${r.state}: ${r.c}`));
  (await query(`SELECT commodity,COUNT(*)::int c FROM historical_market_prices GROUP BY 1 ORDER BY 2 DESC`)).rows.forEach(r=>log(`COMMODITY ${r.commodity}: ${r.c}`));
  log('=== IMPORT COMPLETE ===');
}
main().then(()=>process.exit(0)).catch(e=>{log('FATAL: '+e.message);process.exit(1);});
