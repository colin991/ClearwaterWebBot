const root = document.querySelector('[data-resource-page]');
const page = root?.dataset.resourcePage;
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function json(url, options) {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Information is unavailable.');
  return body;
}

const resourceIndex = [
  ['Live Operations Dashboard', '/operations', 'server status weather deputies districts watch commanders'],
  ['Deputy Directory', '/deputy-directory', 'staff callsign rank division status'],
  ['Community Events Calendar', '/calendar', 'events patrol operations recruitment training reminders'],
  ['Awards and Promotions', '/awards', 'promotions commendations certifications recognition'],
  ['Recruitment Progress Tracker', '/recruitment-progress', 'application orientation training ride along completed'],
  ['Crime and Incident Map', '/incident-map', 'crime incidents calls map public safety'],
  ['Policies and SOP Library', '/policies', 'patrol traffic investigations radio discipline policy'],
  ['Patrol Ride Along Program', '/ride-along', 'request supervisor waiver rules reviews'],
  ['News and Press Releases', '/news', 'news releases announcements photos'],
  ['Public Records', '/public-records', 'records request documents'],
  ['File a Police Report', '/police-report', 'report incident police'],
  ['Contact PCSO', '/contact', 'tickets help complaint'],
];

const policies = [
  ['Patrol', 'Traffic stops and scene response', 'Mark your status and location, use a safe approach, request backup early, and keep dispatch updated.'],
  ['Patrol', 'Vehicle pursuits', 'Pursuits require a qualifying serious offense, continuous risk assessment, and supervisor oversight.'],
  ['Traffic', 'Crash response', 'Protect the scene, request Fire/EMS when needed, manage traffic, investigate, and document before clearing.'],
  ['Traffic', 'PIT and spike strips', 'Only trained personnel may use approved tactics when authorization and road conditions permit.'],
  ['Investigations', 'Evidence handling', 'Preserve, document, and transfer evidence without breaking the chain of custody.'],
  ['Investigations', 'Case follow-up', 'Record interviews, leads, and disposition in the assigned report before closing a case.'],
  ['Radio', 'Radio traffic', 'Use concise unit, location, and status transmissions. Hold nonessential traffic during priorities.'],
  ['Radio', 'Emergency traffic', 'State the emergency and location first. Other units keep the channel clear until released.'],
  ['Discipline', 'Professional conduct', 'Members must act respectfully, follow lawful supervision, and avoid misuse of department authority.'],
  ['Discipline', 'Corrective action', 'Coaching, warnings, strikes, suspension, or removal may be used based on severity and history.'],
];

function searchBox(placeholder = 'Search…') {
  return `<label class="pcso-resource-search"><span>Search</span><input type="search" data-resource-search placeholder="${esc(placeholder)}"></label>`;
}

function formatMs(ms) {
  const minutes = Math.max(0, Math.floor(Number(ms || 0) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function eventIcs(event) {
  const stamp = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = event.startsAt ? stamp(event.startsAt) : stamp(Date.now() + 86400000);
  const end = event.endsAt ? stamp(event.endsAt) : stamp(new Date(event.startsAt || Date.now() + 86400000).getTime() + 3600000);
  const body = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:${start}\r\nDTEND:${end}\r\nSUMMARY:${String(event.title || 'PCSO Event').replace(/[\n,;]/g, ' ')}\r\nLOCATION:${String(event.location || '').replace(/[\n,;]/g, ' ')}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
  link.download = 'pcso-event.ics';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function renderSearch() {
  root.innerHTML = `${searchBox('Search the PCSO website')}<div class="pcso-resource-results" data-results></div>`;
  const content = await json('/api/pcso/content').catch(() => ({ news: [], events: [] }));
  const dynamic = [
    ...(content.news || []).map((x) => [x.title, '/news', `news press release ${x.summary || ''} ${x.body || ''}`]),
    ...(content.events || []).map((x) => [x.title, '/calendar', `event ${x.location || ''} ${x.description || ''}`]),
  ];
  const input = root.querySelector('[data-resource-search]');
  const results = root.querySelector('[data-results]');
  const paint = () => {
    const q = input.value.trim().toLowerCase();
    const rows = [...resourceIndex, ...dynamic].filter((x) => !q || x.join(' ').toLowerCase().includes(q));
    results.innerHTML = rows.length ? rows.map((x) => `<a class="pcso-resource-card" href="${x[1]}"><strong>${esc(x[0])}</strong><span>${esc(x[2].split(' ').slice(0, 12).join(' '))}</span></a>`).join('') : '<p>No results found.</p>';
  };
  input.addEventListener('input', paint); paint(); input.focus();
}

async function renderCalendar() {
  const data = await json('/api/pcso/content');
  const events = [...(data.events || [])].sort((a, b) => Date.parse(a.startsAt || 0) - Date.parse(b.startsAt || 0));
  root.innerHTML = events.length ? `<div class="pcso-calendar-grid">${events.map((x, i) => `<article class="pcso-resource-card"><time>${esc(x.whenLabel || (x.startsAt ? new Date(x.startsAt).toLocaleString() : 'Date TBA'))}</time><h2>${esc(x.title)}</h2><p>${esc(x.location || 'Location TBA')}</p><p>${esc(x.description || '')}</p><button class="pcso-button pcso-button-muted" data-remind="${i}">Add reminder</button></article>`).join('')}</div>` : '<p>No upcoming community events are scheduled.</p>';
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-remind]'); if (b) eventIcs(events[Number(b.dataset.remind)]); });
}

function renderPolicies() {
  root.innerHTML = `${searchBox('Search policies and SOPs')}<div class="pcso-policy-grid" data-results></div>`;
  const input = root.querySelector('input'); const mount = root.querySelector('[data-results]');
  const paint = () => { const q = input.value.toLowerCase(); const rows = policies.filter((x) => !q || x.join(' ').toLowerCase().includes(q)); mount.innerHTML = rows.map((x) => `<article class="pcso-resource-card"><span class="pcso-resource-tag">${esc(x[0])}</span><h2>${esc(x[1])}</h2><p>${esc(x[2])}</p></article>`).join('') || '<p>No policy matched.</p>'; };
  input.addEventListener('input', paint); paint();
}

async function operations() { return json('/api/pcso/portal?kind=operations'); }
function operationsCards(data) {
  const markers = (data.mapPlayers || []).map((player) => `<span class="pcso-operations-player pcso-team-${esc(player.team.toLowerCase().replace(/[^a-z]+/g, '-'))}" style="left:${Number(player.left) * 100}%;top:${Number(player.top) * 100}%" title="${esc(`${player.callsign} · ${player.username} · ${player.team}`)}"><b>${esc(player.callsign)}</b><i></i></span>`).join('');
  return `<div class="pcso-stat-grid"><article><span>Server</span><strong>${data.server?.online ? 'Online' : 'Unavailable'}</strong></article><article><span>Players</span><strong>${data.server?.players ?? 0}${data.server?.maxPlayers ? ` / ${data.server.maxPlayers}` : ''}</strong></article><article><span>Weather</span><strong>${esc(data.weather || 'Unknown')}</strong></article><article><span>On duty</span><strong>${data.deputies?.length || 0}</strong></article></div><section class="pcso-operations-map-section"><div><h2>Live ER:LC map</h2><p>Every currently located player is marked with their callsign.</p></div><div class="pcso-operations-map"><img src="${esc(data.mapUrl || 'assets/liberty-county-map.png')}" alt="Live ER:LC Liberty County map"><div class="pcso-operations-markers">${markers}</div></div><p class="pcso-map-count">${(data.mapPlayers || []).length} of ${data.server?.players || 0} player locations available.</p></section><div class="pcso-district-grid">${(data.districts || []).map((x) => `<article class="pcso-resource-card"><span class="pcso-resource-tag">${x.count} assigned</span><h2>${esc(x.name)}</h2><p><strong>Watch Commander:</strong> ${x.watchCommander ? `${esc(x.watchCommander.rank)} ${esc(x.watchCommander.name)}` : 'None available'}</p></article>`).join('')}</div><p class="pcso-resource-updated">Updated ${new Date(data.fetchedAt || Date.now()).toLocaleTimeString()}</p>`;
}
async function renderOperations() { root.innerHTML = '<p>Loading live operations…</p>'; const paint = async () => { try { root.innerHTML = operationsCards(await operations()); } catch (e) { root.innerHTML = `<p>${esc(e.message)}</p>`; } }; await paint(); setInterval(paint, 30000); }

async function renderDirectory() {
  const data = await operations(); root.innerHTML = `${searchBox('Search name, callsign, rank, or district')}<div data-results></div>`;
  const input = root.querySelector('input'); const mount = root.querySelector('[data-results]');
  const paint = () => { const q = input.value.toLowerCase(); const rows = (data.deputies || []).filter((x) => !q || [x.name,x.callsign,x.rank,x.district].join(' ').toLowerCase().includes(q)); mount.innerHTML = `<div class="pcso-directory-grid">${rows.map((x) => `<article class="pcso-resource-card"><span class="pcso-duty-dot">On duty</span><h2>${esc(x.callsign)} · ${esc(x.name)}</h2><p>${esc(x.rank)} · ${esc(x.district)}</p><small>Current shift ${formatMs(x.shiftMs)}</small></article>`).join('')}</div>`; };
  input.addEventListener('input', paint); paint();
}

async function renderAwards() {
  const content = await json('/api/pcso/content'); const match = /promot|award|commend|certif|recognition/i;
  const rows = (content.news || []).filter((x) => match.test(`${x.title} ${x.summary} ${x.body}`));
  root.innerHTML = rows.length ? `<div class="pcso-directory-grid">${rows.map((x) => `<article class="pcso-resource-card">${x.imageUrl ? `<img src="${esc(x.imageUrl)}" alt="">` : ''}<span class="pcso-resource-tag">Recognition</span><h2>${esc(x.title)}</h2><p>${esc(x.summary || x.body)}</p><time>${new Date(x.publishedAt).toLocaleDateString()}</time></article>`).join('')}</div>` : '<p>No current awards or promotion announcements.</p>';
}

async function renderRecruitment() {
  const session = await json('/api/auth/me'); if (!session.authenticated) { root.innerHTML = '<p><a class="pcso-button pcso-button-red" href="/signin?next=/recruitment-progress">Sign in to view progress</a></p>'; return; }
  const data = await json('/api/pcso/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'application', action: 'status' }) });
  const latest = data.latest; let active = 0;
  if (latest?.status === 'pending') active = 1; else if (latest?.status === 'approved') active = latest.onboardingCompletedAt ? 3 : 2; else if (data.alreadyMember) active = 6;
  const steps = ['Submitted','Under review','Accepted','Orientation','Training','Ride-along','Completed'];
  root.innerHTML = latest ? `<ol class="pcso-progress-steps">${steps.map((x,i) => `<li class="${i <= active ? 'is-complete' : ''}"><span>${i + 1}</span><strong>${x}</strong></li>`).join('')}</ol><p><a class="pcso-button pcso-button-muted" href="/application-result">Open application result</a></p>` : '<p>No application is on file. <a href="/careers">Start an application</a>.</p>';
}

async function renderIncidents() {
  const data = await json('/api/pcso/portal?kind=calls').catch((e) => ({ calls: [], error: e.message }));
  root.innerHTML = `<div class="pcso-incident-map"><img src="assets/liberty-county-map.png" alt="Liberty County map">${(data.calls || []).filter((x) => Number.isFinite(x.mapLeft) && Number.isFinite(x.mapTop)).map((x) => `<i style="left:${x.mapLeft * 100}%;top:${x.mapTop * 100}%" title="${esc(x.type || 'Incident')}"></i>`).join('')}</div><div class="pcso-directory-grid">${(data.calls || []).map((x) => `<article class="pcso-resource-card"><span class="pcso-resource-tag">Active incident</span><h2>${esc(x.type || x.title || 'Call for service')}</h2><p>${esc(x.location || x.address || 'Location withheld')}</p></article>`).join('') || `<p>${esc(data.error || 'No public active incidents.')}</p>`}</div>`;
}

if (root) {
  const handlers = { search: renderSearch, calendar: renderCalendar, policies: renderPolicies, operations: renderOperations, directory: renderDirectory, awards: renderAwards, recruitment: renderRecruitment, incidents: renderIncidents };
  Promise.resolve(handlers[page]?.()).catch((error) => { root.innerHTML = `<p>${esc(error.message)}</p>`; });
}
