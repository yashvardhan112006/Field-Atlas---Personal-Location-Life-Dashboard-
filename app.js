(function(){
  "use strict";
  const DATA = window.TIMELINE_DATA;
  const summary = DATA.summary;
  const visits = DATA.visits;
  const activities = DATA.activities;
  const topPlaces = DATA.topPlaces;

  // ---------- Mode styling ----------
  const MODE_COLORS = {
    IN_PASSENGER_VEHICLE: "#3D5A73",
    WALKING: "#1F5C4F",
    CYCLING: "#C9A227",
    MOTORCYCLING: "#A8431F",
    FLYING: "#7E3015",
    IN_BUS: "#6B4226",
    IN_TRAIN: "#4A6B5C",
    IN_SUBWAY: "#8A6FA8",
    UNKNOWN_ACTIVITY_TYPE: "#8A7F6E"
  };
  const MODE_LABELS = {
    IN_PASSENGER_VEHICLE: "Driving",
    WALKING: "Walking",
    CYCLING: "Cycling",
    MOTORCYCLING: "Motorcycling",
    FLYING: "Flying",
    IN_BUS: "Bus",
    IN_TRAIN: "Train",
    IN_SUBWAY: "Subway",
    UNKNOWN_ACTIVITY_TYPE: "Other"
  };
  function modeColor(t){ return MODE_COLORS[t] || "#8A7F6E"; }
  function modeLabel(t){ return MODE_LABELS[t] || t; }

  function fmtNum(n, decimals){
    if (decimals === undefined) decimals = 0;
    return n.toLocaleString(undefined, {maximumFractionDigits: decimals, minimumFractionDigits: decimals});
  }
  function fmtDate(s){
    const d = new Date(s);
    return d.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'});
  }
  function fmtDateShort(s){
    const d = new Date(s);
    return d.toLocaleDateString(undefined, {year:'2-digit', month:'short'});
  }

  // ---------- Hero stats ----------
  document.getElementById('heroDateStart').textContent = fmtDate(summary.dateRangeStart);
  document.getElementById('heroDateEnd').textContent = fmtDate(summary.dateRangeEnd);
  document.getElementById('generatedStamp').textContent = "Built " + new Date().toLocaleDateString();

  const heroStats = [
    {num: fmtNum(summary.totalDistanceKm), unit:"km", lbl:"Total distance covered"},
    {num: fmtNum(summary.totalVisits), unit:"", lbl:"Distinct stays recorded"},
    {num: fmtNum(Math.round(summary.totalVisitHours/24)), unit:"days", lbl:"Time spent at rest"},
    {num: fmtNum(summary.totalActivities), unit:"trips", lbl:"Journeys logged"},
  ];
  const heroRow = document.getElementById('heroStats');
  heroStats.forEach(s=>{
    const div = document.createElement('div');
    div.className = 'hero-stat';
    div.innerHTML = `<span class="num">${s.num}${s.unit?`<span class="unit">${s.unit}</span>`:''}</span><span class="lbl">${s.lbl}</span>`;
    heroRow.appendChild(div);
  });

  // ---------- Map setup ----------
  const map = L.map('map', {
    scrollWheelZoom: true,
    zoomControl: true,
    attributionControl: true
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19
  }).addTo(map);

  // Build year list
  const years = new Set();
  activities.forEach(a => years.add(new Date(a.start).getFullYear()));
  visits.forEach(v => years.add(new Date(v.start).getFullYear()));
  const sortedYears = Array.from(years).sort();

  const yearSelect = document.getElementById('yearSelect');
  const allOpt = document.createElement('option');
  allOpt.value = 'all'; allOpt.textContent = 'All years';
  yearSelect.appendChild(allOpt);
  sortedYears.forEach(y=>{
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    yearSelect.appendChild(opt);
  });

  // Mode chips
  const presentModes = Array.from(new Set(activities.map(a=>a.type))).sort((a,b)=>{
    return (summary.activityTypeDistanceKm[b]||0) - (summary.activityTypeDistanceKm[a]||0);
  });
  const activeModes = new Set(presentModes);
  const chipWrap = document.getElementById('modeChips');
  presentModes.forEach(m=>{
    const chip = document.createElement('div');
    chip.className = 'chip active';
    chip.dataset.mode = m;
    chip.innerHTML = `<span class="swatch" style="background:${modeColor(m)}"></span>${modeLabel(m)}`;
    chip.addEventListener('click', ()=>{
      if(activeModes.has(m)){ activeModes.delete(m); chip.classList.remove('active'); }
      else { activeModes.add(m); chip.classList.add('active'); }
      renderMap();
    });
    chipWrap.appendChild(chip);
  });

  // Map legend (static, mirrors chips but always visible)
  const legendWrap = document.getElementById('mapLegend');
  presentModes.forEach(m=>{
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-swatch" style="background:${modeColor(m)}"></span>${modeLabel(m)}`;
    legendWrap.appendChild(item);
  });

  let layerGroup = L.layerGroup().addTo(map);
  let allBounds = null;

  function getYearFilter(){
    const v = yearSelect.value;
    return v === 'all' ? null : parseInt(v, 10);
  }

  function renderMap(){
    layerGroup.clearLayers();
    const yf = getYearFilter();
    const bounds = [];

    // Draw activity polylines
    activities.forEach(a=>{
      if(!activeModes.has(a.type)) return;
      const y = new Date(a.start).getFullYear();
      if(yf !== null && y !== yf) return;
      const latlngs = [[a.startLat, a.startLng],[a.endLat, a.endLng]];
      const line = L.polyline(latlngs, {
        color: modeColor(a.type),
        weight: a.type === 'FLYING' ? 1.4 : 2.2,
        opacity: a.type === 'FLYING' ? 0.55 : 0.65,
        dashArray: a.type === 'FLYING' ? '4,5' : null
      });
      line.bindPopup(
        `<div class="popup-title">${modeLabel(a.type)}</div>` +
        `<b>${fmtDate(a.start)}</b><br>${(new Date(a.start)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} &rarr; ${(new Date(a.end)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}<br>` +
        `${fmtNum(a.distanceM/1000,1)} km &middot; ${fmtNum(a.durMin)} min`
      );
      layerGroup.addLayer(line);
      bounds.push(latlngs[0], latlngs[1]);
    });

    // Draw visit circles (only significant ones, capped for perf)
    let visitsToShow = visits.filter(v=>{
      const y = new Date(v.start).getFullYear();
      if(yf !== null && y !== yf) return false;
      return true;
    });
    // cap to avoid overplotting when "all years" selected
    if(visitsToShow.length > 1500){
      visitsToShow = visitsToShow.filter(v=>v.durMin >= 20);
    }

    visitsToShow.forEach(v=>{
      const radius = Math.min(18, Math.max(4, Math.sqrt(v.durMin) * 0.9));
      const isHome = v.label === 'HOME' || v.label === 'INFERRED_HOME';
      const isWork = v.label === 'WORK' || v.label === 'INFERRED_WORK';
      let color = '#2B2118';
      if(isHome) color = '#1F5C4F';
      else if(isWork) color = '#3D5A73';
      const circle = L.circleMarker([v.lat, v.lng], {
        radius: radius,
        color: color,
        weight: 1,
        fillColor: color,
        fillOpacity: 0.28
      });
      const hrs = v.durMin / 60;
      const durStr = hrs >= 24 ? `${fmtNum(hrs/24,1)} days` : (hrs >= 1 ? `${fmtNum(hrs,1)} hrs` : `${fmtNum(v.durMin)} min`);
      const tag = isHome ? 'Home' : (isWork ? 'Work' : (v.label === 'SEARCHED_ADDRESS' ? 'Known address' : 'Visit'));
      circle.bindPopup(
        `<div class="popup-title">${tag}</div>` +
        `<b>${fmtDate(v.start)}</b><br>Stayed ${durStr}`
      );
      layerGroup.addLayer(circle);
      bounds.push([v.lat, v.lng]);
    });

    document.getElementById('mapCount').textContent =
      `Showing ${visitsToShow.length.toLocaleString()} stays and ${activities.filter(a=>{
        if(!activeModes.has(a.type)) return false;
        const y = new Date(a.start).getFullYear();
        return yf === null || y === yf;
      }).length.toLocaleString()} journeys`;

    if(bounds.length){
      const b = L.latLngBounds(bounds);
      if(!allBounds) allBounds = b;
      map.fitBounds(b, {padding:[24,24]});
    }
  }

  yearSelect.addEventListener('change', renderMap);
  document.getElementById('resetView').addEventListener('click', ()=>{
    yearSelect.value = 'all';
    activeModes.clear();
    presentModes.forEach(m=>activeModes.add(m));
    document.querySelectorAll('.chip').forEach(c=>c.classList.add('active'));
    renderMap();
  });

  map.setView([15, 75], 5);
  renderMap();

  // ---------- Month chart (custom SVG bar chart) ----------
  function renderMonthChart(){
    const svg = document.getElementById('monthChart');
    const entries = Object.entries(summary.monthlyDistanceKm); // [["2021-10", val], ...]
    const W = svg.parentElement.clientWidth || 1100;
    const H = 260;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';

    const padL = 50, padR = 10, padT = 16, padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const maxVal = Math.max(...entries.map(e=>e[1]));
    const barGap = 2;
    const barW = Math.max(1.5, plotW / entries.length - barGap);

    const ns = "http://www.w3.org/2000/svg";

    // gridlines + y labels
    const gridSteps = 4;
    for(let i=0;i<=gridSteps;i++){
      const val = (maxVal / gridSteps) * i;
      const y = padT + plotH - (val/maxVal)*plotH;
      const line = document.createElementNS(ns,'line');
      line.setAttribute('x1', padL); line.setAttribute('x2', W-padR);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      line.setAttribute('stroke', 'rgba(43,33,24,0.12)');
      line.setAttribute('stroke-width','1');
      svg.appendChild(line);

      const text = document.createElementNS(ns,'text');
      text.setAttribute('x', padL - 8); text.setAttribute('y', y+3);
      text.setAttribute('text-anchor','end');
      text.setAttribute('font-family','Space Mono, monospace');
      text.setAttribute('font-size','10');
      text.setAttribute('fill','#5C4F3F');
      text.textContent = Math.round(val).toLocaleString();
      svg.appendChild(text);
    }

    const tooltip = document.createElement('div');
    tooltip.style.position='absolute';
    tooltip.style.pointerEvents='none';
    tooltip.style.background='#2B2118';
    tooltip.style.color='#F1EAD9';
    tooltip.style.fontFamily="'Space Mono', monospace";
    tooltip.style.fontSize='11px';
    tooltip.style.padding='6px 9px';
    tooltip.style.borderRadius='2px';
    tooltip.style.opacity='0';
    tooltip.style.transition='opacity .1s';
    tooltip.style.zIndex='10';
    svg.parentElement.style.position='relative';
    svg.parentElement.appendChild(tooltip);

    entries.forEach((entry, i)=>{
      const [key, val] = entry;
      const x = padL + i * (barW + barGap);
      const h = maxVal > 0 ? (val/maxVal)*plotH : 0;
      const y = padT + plotH - h;
      const rect = document.createElementNS(ns,'rect');
      rect.setAttribute('x', x); rect.setAttribute('y', y);
      rect.setAttribute('width', barW); rect.setAttribute('height', Math.max(h,1));
      const [yy, mm] = key.split('-');
      const isDec = mm === '01'; // highlight january as year marker
      rect.setAttribute('fill', isDec ? '#A8431F' : '#3D5A73');
      rect.setAttribute('opacity','0.75');
      rect.style.cursor='pointer';
      rect.addEventListener('mouseenter', (e)=>{
        rect.setAttribute('opacity','1');
        const monthName = new Date(parseInt(yy), parseInt(mm)-1, 1).toLocaleDateString(undefined,{month:'short', year:'numeric'});
        tooltip.textContent = `${monthName}: ${val.toLocaleString(undefined,{maximumFractionDigits:1})} km`;
        tooltip.style.opacity='1';
      });
      rect.addEventListener('mousemove', (e)=>{
        const rectBox = svg.parentElement.getBoundingClientRect();
        tooltip.style.left = (e.clientX - rectBox.left + 10) + 'px';
        tooltip.style.top = (e.clientY - rectBox.top - 30) + 'px';
      });
      rect.addEventListener('mouseleave', ()=>{
        rect.setAttribute('opacity','0.75');
        tooltip.style.opacity='0';
      });
      svg.appendChild(rect);

      // x labels: show every january
      if(mm === '01'){
        const text = document.createElementNS(ns,'text');
        text.setAttribute('x', x); text.setAttribute('y', H-8);
        text.setAttribute('font-family','Space Mono, monospace');
        text.setAttribute('font-size','10');
        text.setAttribute('fill','#5C4F3F');
        text.textContent = yy;
        svg.appendChild(text);
      }
    });
  }
  renderMonthChart();
  window.addEventListener('resize', renderMonthChart);

  // ---------- Mode list ----------
  const modeListEl = document.getElementById('modeList');
  const modeMaxKm = Math.max(...Object.values(summary.activityTypeDistanceKm));
  presentModes.forEach(m=>{
    const km = summary.activityTypeDistanceKm[m] || 0;
    const count = summary.activityTypeCounts[m] || 0;
    const row = document.createElement('div');
    row.className = 'mode-row';
    row.innerHTML = `
      <div class="mode-name"><span class="mode-dot" style="background:${modeColor(m)}"></span>${modeLabel(m)}</div>
      <div class="mode-bar-bg"><div class="mode-bar-fill" style="width:${(km/modeMaxKm*100).toFixed(1)}%; background:${modeColor(m)};"></div></div>
      <div class="mode-km">${fmtNum(km)} km</div>
      <div class="mode-count">${fmtNum(count)}&times;</div>
    `;
    modeListEl.appendChild(row);
  });

  // ---------- Place list ----------
  const placeListEl = document.getElementById('placeList');
  function placeName(p){
    if(p.label === 'HOME') return 'Home';
    if(p.label === 'WORK') return 'Work';
    return `Place near ${p.lat.toFixed(3)}°, ${p.lng.toFixed(3)}°`;
  }
  topPlaces.slice(0,10).forEach((p, i)=>{
    const row = document.createElement('div');
    row.className = 'place-row';
    const days = p.totalMin/60/24;
    row.innerHTML = `
      <div class="place-rank">${i+1}</div>
      <div>
        <div class="place-name">${placeName(p)}</div>
        <div class="place-meta">${p.visitCount} visits</div>
      </div>
      <div class="place-stat">${days >= 1 ? fmtNum(days,1)+' days' : fmtNum(p.totalMin/60,1)+' hrs'}</div>
    `;
    row.addEventListener('click', ()=>{
      map.setView([p.lat, p.lng], 15);
      window.scrollTo({top: document.getElementById('map').getBoundingClientRect().top + window.scrollY - 100, behavior:'smooth'});
    });
    placeListEl.appendChild(row);
  });

})();
