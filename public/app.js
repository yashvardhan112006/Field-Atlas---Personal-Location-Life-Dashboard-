const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const state = {
  mode: 'single',
  data: null,
  from: null,
  to: null,
  currentView: 'landing',
  mapProvider: localStorage.getItem('recall_map_provider') || 'carto_dark',
  leafletMap: null,
  focus: new Set()
};

const colors = { spotify: '#54d889', walking: '#68a8ff', driving: '#ff9c58', chrome: '#a987ff', chess: '#ff6577', meet: '#f5d45d', health: '#4ed6ca', location: '#dde2e8' };

const fmtTime = ms => new Intl.DateTimeFormat('en-IN', state.from && state.to && state.from !== state.to
  ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }
  : { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(ms);

const fmtDate = s => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(s + 'T00:00Z'));

const dur = ms => {
  ms = Math.max(0, ms);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
  return h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
};

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const toast = t => {
  const x = $('#toast');
  x.textContent = t;
  x.style.cssText = 'position:fixed;z-index:9999;left:50%;bottom:25px;transform:translateX(-50%);background:#222831;color:white;padding:10px 16px;border-radius:9px;display:block;';
  setTimeout(() => x.style.display = 'none', 1800);
};

function parseHash() {
  const hash = window.location.hash || '';
  if (!hash || hash === '#' || hash === '#/') {
    return { view: 'landing', from: null, to: null };
  }
  const parts = hash.slice(2).split('?');
  const view = parts[0];
  const params = new URLSearchParams(parts[1] || '');
  return {
    view,
    from: params.get('from'),
    to: params.get('to')
  };
}

function updateNavLinks() {
  $$('.nav-item').forEach(el => {
    const view = el.dataset.view;
    el.href = `#/${view}?from=${state.from}&to=${state.to}`;
  });
}

function destroyCurrentMap() {
  if (state.leafletMap) {
    state.leafletMap.remove();
    state.leafletMap = null;
  }
  const el = $('#lifeMap');
  if (el) el.innerHTML = '';
}

async function loadDataAndRoute(view, from, to) {
  state.from = from;
  state.to = to;
  $('#from').value = from;
  $('#to').value = to;
  
  const cont = $('#continue');
  if (cont) cont.textContent = 'Reconstructing…';
  
  try {
    state.data = await fetch(`/api/day?from=${from}&to=${to}`).then(r => r.json());
    $('#landing').hidden = true;
    $('#dashboard').hidden = false;
    state.currentView = view;
    renderActiveView();
    updateNavLinks();
  } catch (err) {
    toast('Error loading reconstruction data.');
    window.location.hash = '#/';
  } finally {
    if (cont) cont.innerHTML = 'Reconstruct my day <span>→</span>';
  }
}

async function handleRoute() {
  const route = parseHash();
  if (route.view === 'landing') {
    $('#dashboard').hidden = true;
    $('#landing').hidden = false;
    state.currentView = 'landing';
    return;
  }
  if (!route.from) {
    window.location.hash = '#/';
    return;
  }
  if (route.from !== state.from || route.to !== state.to || !state.data) {
    await loadDataAndRoute(route.view, route.from, route.to);
  } else {
    $('#landing').hidden = true;
    $('#dashboard').hidden = false;
    state.currentView = route.view;
    renderActiveView();
  }
}

function shift(n) {
  const d = new Date(state.from + 'T00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  const x = d.toISOString().slice(0, 10);
  window.location.hash = `#/${state.currentView}?from=${x}&to=${x}`;
}

const relatedChips = r => Object.entries(r || {}).map(([k, v]) => `<span class="chip">${v.length} ${k}</span>`).join('');

function faviconImg(domain) {
  return `<img class="favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32" alt="" onerror="this.style.display='none'">`;
}

function narrative(d) {
  const s = d.summary;
  return s.events ? `A day of ${s.chromeVisits} pages, ${s.spotifyMinutes} minutes of music, ${s.chessGames} chess games and ${s.steps.toLocaleString()} steps.` : 'No recorded activity found for this date.';
}

function mapHTML(items) {
  const pts = [];
  items.forEach(x => {
    if (x.coords) pts.push(x.coords);
    if (x.from) pts.push(x.from);
    if (x.to) pts.push(x.to);
    if (x.points) pts.push(...x.points.map(p => p.coords));
  });
  if (!pts.length) {
    return `<div class="panel empty">No geography data for this period</div>`;
  }
  return `
    <div class="geography-split">
      <div class="map-container-wrapper">
        <select id="mapProviderSelect" class="map-provider-select">
          <option value="carto_dark" ${state.mapProvider === 'carto_dark' ? 'selected' : ''}>CARTO Dark (OSM - Free)</option>
          <option value="carto_light" ${state.mapProvider === 'carto_light' ? 'selected' : ''}>CARTO Light (OSM - Free)</option>
          <option value="carto_voyager" ${state.mapProvider === 'carto_voyager' ? 'selected' : ''}>CARTO Voyager (OSM - Free)</option>
          <option value="osm_standard" ${state.mapProvider === 'osm_standard' ? 'selected' : ''}>OSM Standard (Free)</option>
          <option value="esri_satellite" ${state.mapProvider === 'esri_satellite' ? 'selected' : ''}>ESRI Satellite (Free)</option>
        </select>
        <div id="lifeMap" class="map-canvas"></div>
      </div>
      <div class="map-sidebar">
        <small style="color:var(--green);font-weight:600;letter-spacing:1px;">STOP CHRONOLOGY</small>
        <h3 style="margin:4px 0 16px;font:600 22px Manrope;">Stops & Journeys</h3>
        <div class="stops-timeline-list">
          ${items.filter(x => x.type === 'visit').map(visitHTML).join('') || '<div class="empty">No stops recorded</div>'}
        </div>
      </div>
    </div>
  `;
}

async function reverseName(coords) {
  try {
    const x = await fetch(`/api/geocode?lat=${coords[0]}&lng=${coords[1]}`).then(r => r.json());
    return x.name;
  } catch {
    return coords.map(n => n.toFixed(5)).join(', ');
  }
}

const placeNameCache = new Map();

async function initRealMap(items) {
  destroyCurrentMap();
  const el = $('#lifeMap');
  if (!el) return;
  const coords = [];
  items.forEach(x => {
    if (x.coords) coords.push(x.coords);
    if (x.from) coords.push(x.from);
    if (x.to) coords.push(x.to);
    if (x.points) coords.push(...x.points.map(p => p.coords));
  });
  if (!coords.length) {
    el.innerHTML = '<div class="empty">No mapping coordinates found</div>';
    return;
  }
  
  if (typeof L === 'undefined') {
    el.innerHTML = '<div class="empty">Map library Leaflet could not load</div>';
    return;
  }
  const canvas = L.canvas({ padding: 0.15 });
  const map = L.map(el, { preferCanvas: true, renderer: canvas, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
  state.leafletMap = map;
  let tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png';
  let attribution = '© OpenStreetMap contributors · © CARTO';
  let maxZoom = 14;
  
  if (state.mapProvider === 'osm_standard') {
    tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    attribution = '© OpenStreetMap contributors';
    maxZoom = 19;
  } else if (state.mapProvider === 'esri_satellite') {
    tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    attribution = 'Tiles © Esri · Source: Esri, USDA, USGS';
    maxZoom = 18;
  } else if (state.mapProvider === 'carto_light') {
    tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
    attribution = '© OpenStreetMap contributors · © CARTO';
    maxZoom = 19;
  } else if (state.mapProvider === 'carto_voyager') {
    tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
    attribution = '© OpenStreetMap contributors · © CARTO';
    maxZoom = 19;
  }
  
  L.tileLayer(tileUrl, {
    subdomains: tileUrl.includes('cartocdn') ? 'abcd' : '',
    minZoom: 2,
    maxZoom: maxZoom,
    maxNativeZoom: maxZoom,
    keepBuffer: 0,
    updateWhenIdle: true,
    attribution: attribution
  }).addTo(map);
  const route = [];
  for (const x of items) {
    if (x.points?.length) route.push(...x.points.map(p => p.coords));
    else {
      if (x.from) route.push(x.from);
      if (x.to) route.push(x.to);
    }
  }
  const stride = Math.max(1, Math.ceil(route.length / 2500));
  const displayRoute = route.filter((_, i) => i % stride === 0 || i === route.length - 1);
  if (displayRoute.length) {
    L.polyline(displayRoute, { renderer: canvas, color: '#101410', weight: 9, opacity: 0.72, lineJoin: 'round', smoothFactor: 1.5 }).addTo(map);
    L.polyline(displayRoute, { renderer: canvas, color: '#b9ef62', weight: 5, opacity: 1, lineJoin: 'round', smoothFactor: 1.5 }).addTo(map);
  }
  for (const x of items.filter(x => x.coords)) {
    const marker = L.circleMarker(x.coords, { renderer: canvas, radius: 8, color: '#111', weight: 3, fillColor: '#b9ef62', fillOpacity: 1 }).addTo(map);
    marker.bindPopup(`<b>${esc(x.name)}</b><br>${fmtTime(x.start)}–${fmtTime(x.end)}<br>${dur(x.end - x.start)}<br><small>Click to resolve address</small>`);
    marker.on('popupopen', async () => {
      const key = x.coords.map(n => n.toFixed(5)).join(',');
      const cached = placeNameCache.get(key);
      if (cached) {
        setPlace(cached);
        return;
      }
      marker.setPopupContent(`<b>${esc(x.name)}</b><br>${fmtTime(x.start)}–${fmtTime(x.end)}<br><small>Resolving address…</small>`);
      const name = await reverseName(x.coords);
      placeNameCache.set(key, name);
      setPlace(name);
    });
    function setPlace(name) {
      x.name = name;
      marker.setPopupContent(`<b>${esc(name)}</b><br>${fmtTime(x.start)}–${fmtTime(x.end)}<br><small>${x.coords.map(n => n.toFixed(5)).join(', ')}</small>`);
      document.querySelectorAll(`[data-coord="${x.coords.join(',')}"]`).forEach(n => n.textContent = name);
    }
  }
  const bounds = L.latLngBounds(coords);
  map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13, animate: false });
  requestAnimationFrame(() => {
    if (state.leafletMap === map) {
      map.invalidateSize(false);
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13, animate: false });
    }
  });
}

function visitHTML(x) {
  return `<div class="visit clickable" data-message="${esc(x.name)} selected"><div class="visit-time">${fmtTime(x.start)}</div><div class="rail"><i></i></div><div class="visit-body"><h3 ${x.coords ? `data-coord="${x.coords.join(',')}"` : ''}>${esc(x.name)}</h3><p>${fmtTime(x.start)} — ${fmtTime(x.end)} · stayed ${dur(x.end - x.start)}</p><div class="chips">${relatedChips(x.related)}${x.coords ? `<span class="chip">${x.coords.map(n => n.toFixed(4)).join(', ')}</span>` : ''}</div></div></div>`;
}

function travelHTML(modes) {
  const icons = { Flight: '✈', Car: '◆', Cycling: '●', Walking: '↟', Motorcycle: '◈', Train: '▰', 'Public transport': '▣' };
  const e = Object.entries(modes).sort((a, b) => b[1].distance - a[1].distance);
  return e.length ? `<div class="grid">${e.map(([k, x]) => `<div class="metric clickable" data-message="${esc(k)} journeys highlighted"><div class="icon">${icons[k] || '↗'}</div><h3>${dur(x.duration)}</h3><p>${esc(k)} · ${(x.distance / 1000).toFixed(1)} km · ${x.count} trip${x.count === 1 ? '' : 's'} · avg ${x.duration ? Math.round(x.distance / 1000 / (x.duration / 3600000)) : 0} km/h</p></div>`).join('')}</div>` : `<div class="panel empty">No travel detected</div>`;
}

function spotifyHTML(d) {
  const songs = d.spotify, byArtist = Object.entries(songs.reduce((m, x) => (m[x.artist] = (m[x.artist] || 0) + x.played, m), {})).sort((a, b) => b[1] - a[1]);
  return `<div class="split"><div class="grid" style="grid-template-columns:repeat(2,1fr)"><div class="metric"><div class="icon spotify-spin">♫</div><h3>${d.summary.spotifyMinutes} min</h3><p>Listening time</p></div><div class="metric"><div class="icon">★</div><h3>${esc(byArtist[0]?.[0] || '—')}</h3><p>Most played artist</p></div></div>${rows(songs.slice(0, 80), x => `${x.title}<small>${esc(x.artist)}</small>`, x => dur(x.played), true)}</div>`;
}

function coverageEmpty(d, source, label) {
  const r = d.sourceRanges?.[source];
  return `<div class="panel empty"><b>No ${label} records inside this selected range.</b>${r ? `<small>Available export coverage: ${fmtDate(r.from)} — ${fmtDate(r.to)}</small>` : ''}</div>`;
}

function chromeHTML(d) {
  if (!d.chrome.length) return coverageEmpty(d, 'chrome', 'Chrome');
  return `<div class="split"><div class="grid" style="grid-template-columns:1fr">${d.summary.topDomains.map(([name, n]) => `<div class="metric clickable" data-message="${esc(name)} activity highlighted"><h3>${esc(name)}</h3><p>${n} visits</p></div>`).join('')}</div>${rows(d.chrome.slice(0, 80), x => `${faviconImg(x.domain)}${esc(x.title)}<small>${esc(x.domain)}</small>`, x => 'visit')}</div>`;
}

function chessHTML(d) {
  if (!d.chess.length) return coverageEmpty(d, 'chess', 'Chess.com');
  const wins = d.chess.filter(x => x.result === 'Win').length;
  return `<div class="grid" style="margin-bottom:15px"><div class="metric"><h3>${d.chess.length}</h3><p>Games played</p></div><div class="metric"><h3>${wins}</h3><p>Wins</p></div><div class="metric"><h3>${d.chess.filter(x => x.result === 'Loss').length}</h3><p>Losses</p></div><div class="metric"><h3>${d.chess.filter(x => x.result === 'Draw').length}</h3><p>Draws</p></div></div>${rows(d.chess, x => `${x.result} vs ${esc(x.opponent)}<small>${x.color} · ${esc(x.opening)} · ${x.moves} moves ${relatedChips(x.related)}</small>`, x => dur(x.end - x.start), true)}`;
}

function rows(items, main, right, click = false) {
  return `<div class="panel list">${items.length ? items.map(x => `<div class="row ${click ? 'clickable' : ''}" data-message="Activity context opened"><time>${fmtTime(x.start)}</time><div><b>${main(x)}</b></div><span class="duration">${right(x)}</span></div>`).join('') : '<div class="empty">No activity in this range</div>'}</div>`;
}

function peakHour(hours) {
  const h = [...hours].sort((a, b) => Object.values(b).slice(1).reduce((x, y) => x + y, 0) - Object.values(a).slice(1).reduce((x, y) => x + y, 0))[0];
  return h ? `${String(h.hour).padStart(2, '0')}:00–${String((h.hour + 1) % 24).padStart(2, '0')}:00` : '00:00-00:00';
}

function categoryItems(k) {
  const d = state.data;
  if (k === 'walking') return d.location.filter(x => x.type === 'trip' && x.mode === 'Walking');
  if (k === 'driving') return d.location.filter(x => x.type === 'trip' && ['Car', 'Motorcycle', 'Public transport'].includes(x.mode));
  if (k === 'health') return d.health.flatMap(day => (day.bins || []).map((bin, hour) => ({ start: day.start + hour * 3600000, end: day.start + (hour + 1) * 3600000, steps: bin.steps, title: `${bin.steps} steps` })).filter(x => x.steps > 0));
  if (k === 'location') return d.location;
  return d[k] || [];
}

function itemLabel(x) { return x.title || x.name || x.opponent || x.domain || x.mode || x.code || `${x.steps || 0} steps`; }

function bindGraph() { $$('.legend button,.master-line').forEach(x => x.onclick = () => toggleFocus(x.dataset.key)); }

function toggleFocus(k) {
  state.focus.has(k) ? state.focus.delete(k) : state.focus.add(k);
  const selected = [...state.focus], c = $('.master-chart');
  c.classList.toggle('focusing', selected.length > 0);
  $$('.master-line,.master-point').forEach(x => x.classList.toggle('active', state.focus.has(x.dataset.key)));
  $$('.legend button').forEach(x => x.classList.toggle('active', state.focus.has(x.dataset.key)));
  renderFocus(selected);
  if (selected.length) $('#focusDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderFocus(selected) {
  const target = $('#focusDetail');
  if (!selected.length) { target.innerHTML = ''; return; }
  if (selected.length === 1) {
    const k = selected[0], items = categoryItems(k);
    target.innerHTML = section('SELECTED SIGNAL', k[0].toUpperCase() + k.slice(1), `${items.length} connected records`, rows(items.slice(0, 100), x => esc(itemLabel(x)), x => dur(x.end - x.start)));
    return;
  }
  const groups = selected.map(k => [k, categoryItems(k)]), overlaps = [];
  for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
    const [ka, aa] = groups[a], [kb, bb] = groups[b];
    let count = 0, total = 0, samples = [];
    for (const x of aa) for (const y of bb) if (x.start < y.end && y.start < x.end) {
      count++;
      total += Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start));
      if (samples.length < 4) samples.push({ start: Math.max(x.start, y.start), a: itemLabel(x), b: itemLabel(y) });
    }
    const activeHours = state.data.hours.filter(h => h[ka] > 0 && h[kb] > 0).map(h => h.hour);
    overlaps.push({ ka, kb, count, total, samples, activeHours });
  }
  const cards = overlaps.map(o => `<div class="correlation-card"><div class="correlation-pair"><i style="background:${colors[o.ka]}"></i>${o.ka}<span>×</span><i style="background:${colors[o.kb]}"></i>${o.kb}</div><h3>${o.count ? `${o.count} direct overlap${o.count === 1 ? '' : 's'}` : `${o.activeHours.length} shared active hour${o.activeHours.length===1 ? '' : 's'}`}</h3><p>${o.total ? `${dur(o.total)} occurring simultaneously` : (o.activeHours.length ? `Both active around ${o.activeHours.map(h => String(h).padStart(2, '0') + ':00').slice(0, 6).join(', ')}` : 'No meaningful overlap in this range')}</p>${o.samples.map(s => `<div class="correlation-sample"><time>${fmtTime(s.start)}</time><b>${esc(s.a)}</b><span>${esc(s.b)}</span></div>`).join('')}</div>`).join('');
  target.innerHTML = section('MULTI-SIGNAL CORRELATION', selected.map(k => k[0].toUpperCase() + k.slice(1)).join(' + '), 'Direct interval overlaps and shared activity windows', `<div class="correlation-grid">${cards}</div>`);
}

function section(k, title, sub, body) { return `<section class="section"><div class="section-head"><div><span class="section-kicker">${k}</span><h2>${title}</h2></div><p>${sub}</p></div>${body}</section>`; }

function renderOverview() {
  const d = state.data, s = d.summary;
  const visits = d.location.filter(x => x.type === 'visit');
  const trips = d.location.filter(x => x.type === 'trip');
  const target = $('#view-overview');
  const range = state.from === state.to ? fmtDate(state.from) : `${fmtDate(state.from)} — ${fmtDate(state.to)}`;
  
  target.innerHTML = `
    <section class="hero">
      <div><span class="kicker">DAY RECONSTRUCTION</span><h1>${range}</h1><p>${narrative(d)}</p></div>
      <div class="statrow">
        <div class="quickstat"><b>${s.events.toLocaleString()}</b><span>CONNECTED EVENTS</span></div>
        <div class="quickstat"><b>${visits.length}</b><span>PLACES</span></div>
        <div class="quickstat"><b>${s.steps.toLocaleString()}</b><span>STEPS</span></div>
      </div>
    </section>
    
    <div class="overview-dashboard">
      <div class="overview-cards">
        <a href="#/map?from=${state.from}&to=${state.to}" class="overview-card">
          <div class="overview-card-header"><span>📍 GEOGRAPHY</span><span>→</span></div>
          <div class="overview-card-value">${visits.length} stops</div>
          <div class="overview-card-footer">${trips.length} journeys recorded</div>
        </a>
        <a href="#/spotify?from=${state.from}&to=${state.to}" class="overview-card">
          <div class="overview-card-header"><span>🎵 MUSIC</span><span>→</span></div>
          <div class="overview-card-value">${s.spotifyMinutes} min</div>
          <div class="overview-card-footer">${d.spotify.length} tracks logged</div>
        </a>
        <a href="#/chrome?from=${state.from}&to=${state.to}" class="overview-card">
          <div class="overview-card-header"><span>🌐 WEB</span><span>→</span></div>
          <div class="overview-card-value">${s.chromeVisits} visits</div>
          <div class="overview-card-footer">Top domain: ${esc(s.topDomains[0]?.[0] || 'N/A')}</div>
        </a>
        <a href="#/health?from=${state.from}&to=${state.to}" class="overview-card">
          <div class="overview-card-header"><span>💪 HEALTH</span><span>→</span></div>
          <div class="overview-card-value">${s.steps.toLocaleString()}</div>
          <div class="overview-card-footer">${(d.health.reduce((n,x)=>n+x.distance,0)/1000).toFixed(1)} km walked</div>
        </a>
        <a href="#/chess?from=${state.from}&to=${state.to}" class="overview-card">
          <div class="overview-card-header"><span>♟️ CHESS</span><span>→</span></div>
          <div class="overview-card-value">${s.chessGames} games</div>
          <div class="overview-card-footer">${d.chess.filter(x=>x.result==='Win').length} wins · ${d.chess.filter(x=>x.result==='Loss').length} losses</div>
        </a>
        <a href="#/analytics?from=${state.from}&to=${state.to}" class="overview-card">
          <div class="overview-card-header"><span>📈 ANALYTICS</span><span>→</span></div>
          <div class="overview-card-value">One Sheet</div>
          <div class="overview-card-footer">Visual timeline correlations</div>
        </a>
      </div>
      
      <div class="panel" style="padding: 24px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <span class="section-kicker">SUMMARY</span>
          <h3 style="margin: 8px 0 16px; font: 600 20px Manrope;">The Day at a Glance</h3>
          <p style="color:var(--muted); line-height:1.6; font-size:13px; margin-bottom: 24px;">
            Your peak hour of active engagement was <b>${peakHour(d.hours)}</b>, with maximum concurrent metrics detected.
          </p>
        </div>
        <div style="background:var(--panel2); border: 1px solid var(--line); border-radius:12px; padding:16px;">
          <b style="display:block; font-size:10px; margin-bottom:6px; color:var(--muted); letter-spacing:1px;">TOP SOUNDTRACK</b>
          <span style="font-size:14px; font-weight:600; color:var(--green);">${esc(Object.entries(d.spotify.reduce((m,x)=>(m[x.artist]=(m[x.artist]||0)+1,m),{})).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'None')}</span>
        </div>
      </div>
    </div>
  `;
}

function renderMap() {
  const d = state.data;
  const target = $('#view-map');
  target.innerHTML = mapHTML(d.location);
  
  const select = $('#mapProviderSelect');
  if (select) {
    select.onchange = () => {
      state.mapProvider = select.value;
      localStorage.setItem('recall_map_provider', select.value);
      initRealMap(d.location);
    };
  }
  initRealMap(d.location);
}

function renderSpotify() {
  const d = state.data, target = $('#view-spotify');
  const songs = d.spotify, byArtist = Object.entries(songs.reduce((m, x) => (m[x.artist] = (m[x.artist] || 0) + x.played, m), {})).sort((a, b) => b[1] - a[1]);
  target.innerHTML = `
    <div class="section-head"><div><span class="section-kicker">03 · LISTENING</span><h2>Spotify Activity</h2></div><p>Soundtrack chronological log</p></div>
    <div class="split">
      <div class="grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="metric"><div class="icon spotify-spin">♫</div><h3>${d.summary.spotifyMinutes} min</h3><p>Listening time</p></div>
        <div class="metric"><div class="icon">★</div><h3 style="font-size:16px; margin-top:20px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(byArtist[0]?.[0] || '—')}">${esc(byArtist[0]?.[0] || '—')}</h3><p>Top artist</p></div>
      </div>
      ${rows(songs.slice(0, 100), x => `${x.title}<small>${esc(x.artist)}</small>`, x => dur(x.played), true)}
    </div>
  `;
}

function renderChrome() {
  const d = state.data, target = $('#view-chrome');
  if (!d.chrome.length) {
    target.innerHTML = `<div class="section-head"><div><span class="section-kicker">04 · BROWSING</span><h2>Chrome History</h2></div></div>${coverageEmpty(d, 'chrome', 'Chrome')}`;
    return;
  }
  target.innerHTML = `
    <div class="section-head"><div><span class="section-kicker">04 · BROWSING</span><h2>Chrome History</h2></div><p>Web activity logs</p></div>
    <div class="split">
      <div class="grid" style="grid-template-columns:1fr">
        ${d.summary.topDomains.map(([name, n]) => `<div class="metric clickable" data-message="${esc(name)} activity highlighted"><h3>${esc(name)}</h3><p>${n} visits</p></div>`).join('')}
      </div>
      ${rows(d.chrome.slice(0, 100), x => `${faviconImg(x.domain)}${esc(x.title)}<small>${esc(x.domain)}</small>`, x => 'visit')}
    </div>
  `;
}

function renderHealth() {
  const d = state.data, target = $('#view-health'), h = d.hours, max = Math.max(...h.map(x => x.health), 1), peak = Math.max(...h.map(x => x.health));
  const steps = d.summary.steps, stepsGoal = 10000, radius = 70, circ = 2 * Math.PI * radius;
  const percent = Math.min(100, (steps / stepsGoal) * 100), strokeDashoffset = circ - (percent / 100) * circ;
  
  target.innerHTML = `
    <div class="section-head"><div><span class="section-kicker">05 · BODY</span><h2>Samsung Health</h2></div><p>Daily body stats and step logs</p></div>
    <div class="split">
      <div class="grid" style="grid-template-columns:1fr">
        <div class="metric" style="display:flex; justify-content:space-around; align-items:center; padding: 12px 24px;">
          <div class="fitness-gauge-container">
            <svg class="gauge-svg">
              <circle class="gauge-bg" cx="80" cy="80" r="${radius}"></circle>
              <circle class="gauge-progress" cx="80" cy="80" r="${radius}" style="stroke-dasharray:${circ}; stroke-dashoffset:${strokeDashoffset};"></circle>
              <text class="gauge-text" x="80" y="85">${steps.toLocaleString()}</text>
              <text class="gauge-subtext" x="80" y="102">/ ${stepsGoal.toLocaleString()} STEPS</text>
            </svg>
          </div>
          <div style="flex:1; padding-left:16px;">
            <h4 style="margin:0 0 6px; font-weight:600; color:var(--green);">Goal Progress</h4>
            <p style="margin:0; font-size:13px; color:var(--muted);">${percent.toFixed(0)}% of step goals met.</p>
            <h4 style="margin:16px 0 6px; font-weight:600;">Distance</h4>
            <p style="margin:0; font-size:13px; color:var(--muted);">${(d.health.reduce((n,x)=>n+x.distance,0)/1000).toFixed(1)} km walked</p>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="activity-chart">
          ${h.map(x => `<div class="activity-col" title="${String(x.hour).padStart(2,'0')}:00 · ${Math.round(x.health)} steps"><div class="activity-bar ${x.health >= peak * 0.7 && x.health ? 'heavy' : ''}" style="height:${x.health ? Math.max(3, x.health / max * 190) : 2}px"></div><small>${x.hour % 3 === 0 ? String(x.hour).padStart(2, '0') : ''}</small></div>`).join('')}
        </div>
        <div class="chart-caption">Steps distribution per hour · glowing lines denote exertion</div>
      </div>
    </div>
  `;
}

function renderChess() {
  const d = state.data, target = $('#view-chess');
  if (!d.chess.length) {
    target.innerHTML = `<div class="section-head"><div><span class="section-kicker">06 · PLAY</span><h2>Chess Activity</h2></div></div>${coverageEmpty(d, 'chess', 'Chess.com')}`;
    return;
  }
  const wins = d.chess.filter(x => x.result === 'Win').length;
  const losses = d.chess.filter(x => x.result === 'Loss').length;
  const draws = d.chess.filter(x => x.result === 'Draw').length;
  target.innerHTML = `
    <div class="section-head"><div><span class="section-kicker">06 · PLAY</span><h2>Chess Activity</h2></div><p>Chess match history</p></div>
    <div class="grid" style="margin-bottom:24px">
      <div class="metric"><h3>${d.chess.length}</h3><p>Games played</p></div>
      <div class="metric" style="border-left:3px solid var(--green)"><h3>${wins}</h3><p>Wins</p></div>
      <div class="metric" style="border-left:3px solid var(--red)"><h3>${losses}</h3><p>Losses</p></div>
      <div class="metric" style="border-left:3px solid var(--muted)"><h3>${draws}</h3><p>Draws</p></div>
    </div>
    ${rows(d.chess, x => `<span style="color:${x.result === 'Win' ? 'var(--green)' : x.result === 'Loss' ? 'var(--red)' : 'var(--muted)'}; font-weight:600;">${x.result}</span> vs ${esc(x.opponent)}<small>${x.color} · ${esc(x.opening)} · ${x.moves} moves ${relatedChips(x.related)}</small>`, x => `<a href="${x.link}" target="_blank" style="color:var(--green); text-decoration:none;">${dur(x.end - x.start)} ↗</a>`, true)}
  `;
}

function renderMeet() {
  const d = state.data, target = $('#view-meet');
  if (!d.meet.length) {
    target.innerHTML = `
      <div class="section-head"><div><span class="section-kicker">07 · CONVERSATIONS</span><h2>Google Meet</h2></div><p>Google Meet call logs</p></div>
      ${coverageEmpty(d, 'meet', 'Google Meet')}
    `;
    return;
  }
  target.innerHTML = `
    <div class="section-head"><div><span class="section-kicker">07 · CONVERSATIONS</span><h2>Google Meet</h2></div><p>Google Meet call logs</p></div>
    ${rows(d.meet, x => `${x.code} <small>Status: ${x.state}</small>`, x => dur(x.end - x.start))}
  `;
}

function renderAnalytics() {
  const d = state.data, target = $('#view-analytics');
  const keys = Object.keys(colors), W = 1000, H = 280, chartTop = 14, bottom = 24, plot = H - chartTop - bottom;
  const scale = Object.fromEntries(keys.map(k => [k, Math.max(...d.hours.map(h => Number(h[k]) || 0), 1)]));
  const paths = keys.map((k, ki) => {
    const points = d.hours.map((h, i) => { const ratio = (Number(h[k]) || 0) / scale[k], intensity = Math.sqrt(ratio); return [i / 23 * W, H - bottom - intensity * plot]; });
    const p = points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const dots = points.filter((_, i) => d.hours[i][k] > 0).map(([x, y]) => `<circle data-key="${k}" class="master-point" fill="${colors[k]}" cx="${x}" cy="${y}" r="3"/>`).join('');
    return `<path data-key="${k}" class="master-line" stroke="${colors[k]}" d="${p}"/>${dots}`;
  }).join('');
  
  const top = d.summary.topDomains[0], artist = Object.entries(d.spotify.reduce((m, x) => (m[x.artist] = (m[x.artist] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1])[0];
  
  target.innerHTML = `
    <div class="section-head"><div><span class="section-kicker">08 · ONE SHEET</span><h2>One Sheet Analysis</h2></div><p>Cross-signal timelines</p></div>
    <div class="master-chart" style="margin-bottom:24px;">
      <div class="legend">${keys.map(k => `<button data-key="${k}"><i style="background:${colors[k]}"></i>${k}</button>`).join('')}</div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        ${[.25, .5, .75, 1].map(v => `<line x1="0" x2="${W}" y1="${H - bottom - v * plot}" y2="${H - bottom - v * plot}" class="chart-gridline"/>`).join('')}
        ${[0, 6, 12, 18, 23].map(h => `<text x="${h / 23 * W}" y="${H}" fill="#777" font-size="11">${String(h).padStart(2, '0')}:00</text>`).join('')}
        ${paths}
      </svg>
    </div>
    <div id="focusDetail" class="detail"></div>
    <section class="section">
      <div class="section-head"><div><span class="section-kicker">CROSS-DATA INTELLIGENCE</span><h2>Interesting patterns</h2></div></div>
      <div class="patterns">
        <div class="pattern"><b>Your dominant soundtrack</b><p>${artist ? `${esc(artist[0])} appeared most often across this range, with ${artist[1]} plays.` : 'More listening data is needed for this day.'}</p></div>
        <div class="pattern"><b>Your browsing center</b><p>${top ? `${esc(top[0])} led your browsing with ${top[1]} visits.` : 'No browsing pattern was recorded.'}</p></div>
        <div class="pattern"><b>Peak activity window</b><p>${peakHour(d.hours)} was the busiest combined hour across movement, listening, play and browsing.</p></div>
      </div>
    </section>
  `;
  bindGraph();
}

function renderActiveView() {
  const view = state.currentView;
  $$('.nav-item').forEach(el => { el.classList.toggle('active', el.dataset.view === view); });
  
  $$('.page-view').forEach(el => { el.classList.toggle('active', el.id === `view-${view}`); });
  
  const d = state.data, s = d.summary;
  const range = d.from === d.to ? fmtDate(d.from) : `${fmtDate(d.from)} — ${fmtDate(d.to)}`;
  const titleEl = $('#dateTitle');
  if (titleEl) titleEl.textContent = range;
  
  if (view === 'overview') renderOverview();
  else if (view === 'map') renderMap();
  else if (view === 'spotify') renderSpotify();
  else if (view === 'chrome') renderChrome();
  else if (view === 'health') renderHealth();
  else if (view === 'chess') renderChess();
  else if (view === 'meet') renderMeet();
  else if (view === 'analytics') renderAnalytics();
  
  $$('.clickable').forEach(x => x.onclick = () => toast(x.dataset.message || 'Timeline context focused'));
}

async function init() {
  const meta = await fetch('/api/meta').then(r => r.json());
  $('#sources').innerHTML = meta.sources.map(x => `<span>✓ ${x}</span>`).join('');
  $('#from').min = $('#to').min = meta.min;
  $('#from').max = $('#to').max = meta.max;
  
  const preferred = Object.entries(meta.counts).filter(([d, n]) => d.startsWith('2025-03') && n > 20).sort((a, b) => b[1] - a[1])[0]?.[0] || meta.max;
  $('#from').value = $('#to').value = preferred;
  
  $$('.mode button').forEach(b => b.onclick = () => {
    state.mode = b.dataset.mode;
    $$('.mode button').forEach(x => x.classList.toggle('active', x === b));
    $('#toWrap').hidden = state.mode === 'single';
    $('#fromLabel').textContent = state.mode === 'single' ? 'DATE' : 'FROM';
  });
  
  $('#continue').onclick = () => {
    const from = $('#from').value;
    const to = state.mode === 'range' ? $('#to').value : from;
    if (!from) return toast('Select a date first');
    window.location.hash = `#/overview?from=${from}&to=${to}`;
  };
  
  $('#home').onclick = () => { window.location.hash = '#/'; };
  $('#theme').onclick = () => document.body.classList.toggle('light');
  $('#prev').onclick = () => shift(-1);
  $('#next').onclick = () => shift(1);
  
  window.onhashchange = handleRoute;
  handleRoute();
}

init();
