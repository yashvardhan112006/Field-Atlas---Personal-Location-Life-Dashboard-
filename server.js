const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8088);
const TZ_OFFSET = 330 * 60000;
let store, loading;

const readJSON = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const dayKey = ms => new Date(ms + TZ_OFFSET).toISOString().slice(0, 10);
const msTime = value => new Date(value).getTime();
const duration = (a, b) => Math.max(0, b - a);
const latLng = text => {
  const n = String(text || '').match(/-?\d+(?:\.\d+)?/g);
  return n ? [Number(n[0]), Number(n[1])] : null;
};
const csv = text => {
  const rows = []; let row = [], val = '', quote = false;
  for (let i=0;i<text.length;i++) {
    const c=text[i], next=text[i+1];
    if (c === '"' && quote && next === '"') { val += '"'; i++; }
    else if (c === '"') quote=!quote;
    else if (c === ',' && !quote) { row.push(val); val=''; }
    else if ((c === '\n' || c === '\r') && !quote) {
      if (c === '\r' && next === '\n') i++;
      row.push(val); if(row.some(Boolean)) rows.push(row); row=[]; val='';
    } else val += c;
  }
  if (val || row.length) { row.push(val); rows.push(row); }
  return rows;
};
function add(index, key, item) { (index[key] ||= []).push(item); }
function overlap(a,b){ return a.start < b.end && b.start < a.end; }
function domain(url) { try { return new URL(url).hostname.replace(/^www\./,''); } catch { return 'unknown'; } }
function labelPlace(v) {
  const c=v.topCandidate||{};
  return c.semanticType === 'INFERRED_HOME' ? 'Home' :
    c.semanticType === 'INFERRED_WORK' ? 'Work' :
    c.placeId ? `Place · ${c.placeId.slice(0,8)}` : 'Visited place';
}
function transportMode(type, distance, elapsed) {
  const raw=String(type||'').toUpperCase(), kmh=elapsed>0?(distance/1000)/(elapsed/3600000):0;
  if(raw.includes('FLY')) return 'Flight';
  if(raw.includes('TRAIN')||raw.includes('SUBWAY')) return 'Train';
  if(raw.includes('BUS')||raw.includes('TRAM')||raw.includes('FERRY')) return 'Public transport';
  if(raw.includes('MOTORCYCL')) return 'Motorcycle';
  if(raw.includes('CYCL')) return 'Cycling';
  if(raw.includes('WALK')||raw.includes('RUN')) return 'Walking';
  if(raw.includes('PASSENGER')||raw.includes('VEHICLE')||raw.includes('UNKNOWN')) {
    if(distance>150000 && kmh>180) return 'Flight';
    if(kmh<8 && distance<12000) return 'Walking';
    if(kmh<28 && distance<45000) return 'Cycling';
    return 'Car';
  }
  return kmh>35?'Car':kmh>10?'Cycling':'Walking';
}

async function load() {
  if (store) return store;
  if (loading) return loading;
  loading = new Promise(resolve => setImmediate(() => {
    const byDay={}, ensure=d=>byDay[d] ||= {location:[],spotify:[],chrome:[],chess:[],health:[],meet:[]};
    const timeline=readJSON('Timeline.json').semanticSegments || [];
    for(const s of timeline) {
      const start=msTime(s.startTime), end=msTime(s.endTime);
      if(!start||!end) continue;
      let item;
      if(s.visit) {
        const p=s.visit.topCandidate||{}, coords=latLng(p.placeLocation?.latLng);
        item={type:'visit',start,end,name:labelPlace(s.visit),coords,placeId:p.placeId,semanticType:p.semanticType};
      } else if(s.activity) {
        const a=s.activity, rawMode=a.topCandidate?.type||'UNKNOWN', distance=a.distanceMeters||0;
        const mode=transportMode(rawMode,distance,end-start), speed=end>start?distance/(end-start)*3600:0;
        item={type:'trip',start,end,mode,rawMode,distance,speed,from:latLng(a.start?.latLng),to:latLng(a.end?.latLng)};
      } else if(s.timelinePath) {
        item={type:'path',start,end,points:s.timelinePath.map(p=>({coords:latLng(p.point),time:msTime(p.time)})).filter(p=>p.coords)};
      }
      if(item) for(let d=dayKey(start), cur=start; cur<end; cur+=86400000,d=dayKey(cur+86400000)) add(ensure(d),'location',item);
    }
    const spotifyFiles=fs.readdirSync(path.join(ROOT,'Spotify Extended Streaming History')).filter(f=>f.endsWith('.json'));
    for(const file of spotifyFiles) for(const x of readJSON(path.join('Spotify Extended Streaming History',file))) {
      const end=msTime(x.ts), played=Number(x.ms_played||0), start=end-played;
      if(!end||played<1000) continue;
      add(ensure(dayKey(start)),'spotify',{start,end,title:x.master_metadata_track_name||x.episode_name||'Unknown audio',artist:x.master_metadata_album_artist_name||x.episode_show_name||'Unknown artist',album:x.master_metadata_album_album_name||'',played,skipped:!!x.skipped,shuffle:!!x.shuffle});
    }
    const history=readJSON('chrome History.json')['Browser History']||[];
    for(const x of history) {
      const start=Math.floor(Number(x.time_usec)/1000); if(!start) continue;
      add(ensure(dayKey(start)),'chrome',{start,end:start+120000,title:x.title||domain(x.url),url:x.url,domain:domain(x.url)});
    }
    const pgnFiles=fs.readdirSync(path.join(ROOT,'chess data')).filter(f=>f.endsWith('.pgn'));
    for(const file of pgnFiles) {
      const blocks=fs.readFileSync(path.join(ROOT,'chess data',file),'utf8').split(/\n\n(?=\[Event )/);
      for(const block of blocks) {
        const tags={}; for(const m of block.matchAll(/^\[(\w+) "([^"]*)"\]/gm)) tags[m[1]]=m[2];
        if(!tags.UTCDate||!tags.UTCTime) continue;
        const start=msTime(`${tags.UTCDate.replaceAll('.','-')}T${tags.UTCTime}Z`);
        let end=start; if(tags.EndDate&&tags.EndTime) end=msTime(`${tags.EndDate.replaceAll('.','-')}T${tags.EndTime}Z`);
        if(end<start) end=start+Number(tags.TimeControl||600)*1000;
        const white=/deepsloth/i.test(tags.White||''), opponent=white?tags.Black:tags.White;
        const won=(white&&tags.Result==='1-0')||(!white&&tags.Result==='0-1');
        const draw=tags.Result==='1/2-1/2', moves=Math.ceil(((block.match(/\d+\.(?!\.)/g)||[]).length));
        add(ensure(dayKey(start)),'chess',{start,end,opponent,color:white?'White':'Black',myRating:Number(white?tags.WhiteElo:tags.BlackElo),opponentRating:Number(white?tags.BlackElo:tags.WhiteElo),result:draw?'Draw':won?'Win':'Loss',opening:(tags.ECOUrl||'').split('/').pop()?.replaceAll('-',' ')||tags.ECO||'Unknown',moves,timeControl:tags.TimeControl,termination:tags.Termination,link:tags.Link});
      }
    }
    const healthDir=path.join(ROOT,'Samsung Health');
    const stepFile=(function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){const x=walk(p);if(x)return x}else if(e.name.includes('step_daily_trend')&&e.name.endsWith('.csv'))return p}})(healthDir);
    if(stepFile) {
      const rows=csv(fs.readFileSync(stepFile,'utf8').replace(/^\uFEFF/,''));
      const header=rows[1], ix=Object.fromEntries(header.map((x,i)=>[x,i]));
      const binRoot=path.join(path.dirname(stepFile),'jsons','com.samsung.shealth.step_daily_trend'), binFiles=new Map();
      (function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);e.isDirectory()?walk(p):binFiles.set(e.name,p)}})(binRoot);
      for(const r of rows.slice(2)) {
        const start=Number(r[ix.day_time]), steps=Number(r[ix.count]||0);
        let bins=[]; const binPath=binFiles.get(r[ix.binning_data]);
        if(binPath) try { const raw=JSON.parse(fs.readFileSync(binPath,'utf8')); bins=Array.from({length:24},(_,hour)=>raw.slice(hour*6,hour*6+6).reduce((a,x)=>({steps:a.steps+Number(x.count||0),distance:a.distance+Number(x.distance||0),calories:a.calories+Number(x.calorie||0)}),{steps:0,distance:0,calories:0})); } catch {}
        if(start) add(ensure(dayKey(start)),'health',{start,end:start+86400000,steps,distance:Number(r[ix.distance]||0),calories:Number(r[ix.calorie]||0),bins});
      }
    }
    if(fs.existsSync(path.join(ROOT,'conference_history_records_IST.csv'))) {
      const rows=csv(fs.readFileSync(path.join(ROOT,'conference_history_records_IST.csv'),'utf8')), head=rows[0], ix=Object.fromEntries(head.map((x,i)=>[x,i]));
      for(const r of rows.slice(1)) {
        const start=msTime((r[ix['Start Time']]||'').replace(' UTC','Z')), end=msTime((r[ix['End Time']]||'').replace(' UTC','Z'));
        if(start&&end) add(ensure(dayKey(start)),'meet',{start,end,code:r[ix['Meeting Code']]||'Google Meet',state:r[ix['Participation State']]});
      }
    }
    for(const d of Object.values(byDay)) for(const k of Object.keys(d)) d[k].sort((a,b)=>a.start-b.start);
    const dates=Object.keys(byDay).sort(),sourceRanges={};
    for(const source of ['location','spotify','chrome','chess','health','meet']){
      const covered=dates.filter(d=>byDay[d][source]?.length);
      sourceRanges[source]=covered.length?{from:covered[0],to:covered.at(-1),days:covered.length}:null;
    }
    store={byDay,dates,sourceRanges,counts:Object.fromEntries(dates.map(d=>[d,Object.values(byDay[d]).reduce((n,a)=>n+a.length,0)]))};
    resolve(store);
  }));
  return loading;
}

function buildRange(data, from, to) {
  const out={location:[],spotify:[],chrome:[],chess:[],health:[],meet:[]};
  for(const d of data.dates) if(d>=from&&d<=to) for(const k in out) out[k].push(...(data.byDay[d]?.[k]||[]));
  const all=Object.values(out).flat().sort((a,b)=>a.start-b.start);
  const attach=item=>{
    const related={};
    for(const [k,items] of Object.entries(out)) if(!items.includes(item)) {
      const hits=items.filter(x=>overlap(item,x)).slice(0,8);
      if(hits.length) related[k]=hits;
    }
    return {...item,related};
  };
  out.spotify=out.spotify.map(attach); out.chess=out.chess.map(attach); out.location=out.location.map(attach);
  const topDomains=Object.entries(out.chrome.reduce((m,x)=>(m[x.domain]=(m[x.domain]||0)+1,m),{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const modes={}; for(const x of out.location.filter(x=>x.type==='trip')) { const m=x.mode; (modes[m]||={duration:0,distance:0,count:0});modes[m].duration+=duration(x.start,x.end);modes[m].distance+=x.distance;modes[m].count++; }
  const hours=Array.from({length:24},(_,hour)=>({hour,spotify:0,walking:0,driving:0,chrome:0,chess:0,meet:0,health:0,location:0}));
  const bump=(k,x,value=1)=>{const h=new Date(x.start+TZ_OFFSET).getUTCHours();hours[h][k]+=value};
  out.spotify.forEach(x=>bump('spotify',x,x.played/60000)); out.chrome.forEach(x=>bump('chrome',x));
  out.chess.forEach(x=>bump('chess',x,duration(x.start,x.end)/60000)); out.meet.forEach(x=>bump('meet',x,duration(x.start,x.end)/60000));
  out.location.forEach(x=>{bump('location',x); if(x.type==='trip') bump(/walk/i.test(x.mode)?'walking':'driving',x,duration(x.start,x.end)/60000)});
  const healthDays={}; for(const x of out.health){const k=dayKey(x.start);if(!healthDays[k]||x.steps>healthDays[k].steps)healthDays[k]=x}
  const canonicalHealth=Object.values(healthDays), steps=canonicalHealth.reduce((n,x)=>n+x.steps,0);
  for(const x of canonicalHealth) for(let i=0;i<24;i++) hours[i].health+=(x.bins?.[i]?.steps||0);
  out.health=canonicalHealth;
  const summary={events:all.length,spotifyMinutes:Math.round(out.spotify.reduce((n,x)=>n+x.played,0)/60000),steps,chromeVisits:out.chrome.length,chessGames:out.chess.length,meetings:out.meet.length,topDomains,modes};
  return {...out,hours,summary,sourceRanges:data.sourceRanges,from,to};
}

function send(res,status,body,type='application/json'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store, max-age=0','Pragma':'no-cache','Expires':'0'});res.end(type.includes('json')?JSON.stringify(body):body)}
const geocodeCache=new Map();
function getJSON(url,headers={}){return new Promise((resolve,reject)=>https.get(url,{headers},r=>{let s='';r.on('data',d=>s+=d);r.on('end',()=>{try{resolve(JSON.parse(s))}catch(e){reject(e)}})}).on('error',reject))}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host}`);
  if(u.pathname==='/api/meta'){const d=await load();return send(res,200,{min:d.dates[0],max:d.dates.at(-1),counts:d.counts,sources:['Google Timeline','Samsung Health','Spotify','Chrome','Chess.com','Google Meet']})}
  if(u.pathname==='/api/config') return send(res,200,{googleMapsKey:process.env.GOOGLE_MAPS_API_KEY||''});
  if(u.pathname==='/api/geocode'){
    const lat=Number(u.searchParams.get('lat')),lng=Number(u.searchParams.get('lng'));if(!Number.isFinite(lat)||!Number.isFinite(lng))return send(res,400,{error:'Invalid coordinates'});
    const key=`${lat.toFixed(5)},${lng.toFixed(5)}`;if(geocodeCache.has(key))return send(res,200,geocodeCache.get(key));
    try{
      let value;
      if(process.env.GOOGLE_MAPS_API_KEY){const x=await getJSON(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(process.env.GOOGLE_MAPS_API_KEY)}`);value={name:x.results?.[0]?.formatted_address||key,provider:'Google'};}
      else {const x=await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,{'User-Agent':'Recall-Day-Reconstruction/1.0'});value={name:x.display_name||key,provider:'OpenStreetMap'};}
      geocodeCache.set(key,value);return send(res,200,value);
    }catch{return send(res,502,{name:key,error:'Geocoding unavailable'});}
  }
  if(u.pathname==='/api/day'){const d=await load(),from=u.searchParams.get('from'),to=u.searchParams.get('to')||from;if(!from)return send(res,400,{error:'Missing date'});return send(res,200,buildRange(d,from,to))}
  let file=u.pathname==='/'?'index.html':u.pathname.slice(1); file=path.normalize(file);
  const full=path.join(ROOT,'public',file); if(!full.startsWith(path.join(ROOT,'public'))||!fs.existsSync(full))return send(res,404,'Not found','text/plain');
  send(res,200,fs.readFileSync(full),mime[path.extname(full)]||'application/octet-stream');
}).listen(PORT,()=>console.log(`Day Reconstruction running at http://localhost:${PORT}`));
load().then(s=>console.log(`Indexed ${s.dates.length} days`));
