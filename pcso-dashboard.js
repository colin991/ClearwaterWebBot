const escapeDashboard = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const duration = (ms) => { const m = Math.floor(Number(ms || 0) / 60000); return `${Math.floor(m / 60)}h ${m % 60}m`; };

async function dashboardData() {
  const [response, employeeResponse] = await Promise.all([
    fetch('/api/pcso/portal', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'employee-dashboard', action: 'list' }), cache: 'no-store',
    }),
    fetch('/api/pcso/employee?action=bootstrap', { credentials: 'same-origin', cache: 'no-store' }),
  ]);
  const body = await response.json().catch(() => ({}));
  const employee = await employeeResponse.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Dashboard unavailable.');
  return { ...body, employee: employeeResponse.ok ? employee : { sessions: [], reports: [] } };
}

function rideSummary(data) {
  const rides = data.rideAlong?.mine || [];
  return rides.length ? rides.slice(0, 3).map((x) => `<article class="pcso-mini-row"><strong>${escapeDashboard(x.status)}</strong><span>${x.scheduledAt ? new Date(x.scheduledAt).toLocaleString() : 'Scheduling pending'}</span><small>${escapeDashboard(x.supervisorName || 'Supervisor not assigned')}</small></article>`).join('') : '<p>No ride-along activity.</p>';
}

async function bootDashboard() {
  const personal = document.querySelector('[data-personal-dashboard]');
  const supervisor = document.querySelector('[data-supervisor-dashboard-content]');
  if (!personal && !supervisor) return;
  try {
    const data = await dashboardData();
    if (personal) {
      personal.hidden = false;
      const you = data.you;
      const status = data.application?.latest?.status || 'No application';
      const sessions = data.employee?.sessions || [];
      const reports = data.employee?.reports || [];
      personal.querySelector('[data-personal-dashboard-content]').innerHTML = `<div class="pcso-stat-grid"><article><span>Shift status</span><strong>${you ? 'On duty' : 'Off duty'}</strong></article><article><span>Current district</span><strong>${escapeDashboard(you?.district || 'Not assigned')}</strong></article><article><span>Current shift</span><strong>${duration(you?.shiftMs)}</strong></article><article><span>Training reports</span><strong>${reports.length}</strong></article></div><div class="pcso-dashboard-columns"><section><h3>Upcoming training</h3>${sessions.length ? sessions.slice(0, 3).map((x) => `<p><strong>${escapeDashboard(x.typeLabel)}</strong><br><small>${escapeDashboard(x.status)} · Code ${escapeDashboard(x.code)}</small></p>`).join('') : '<p>No open training sessions.</p>'}<a class="pcso-text-link" href="/employee/training">Open training →</a></section><section><h3>Activity statistics</h3><p>Current shift: <strong>${duration(you?.shiftMs)}</strong></p><p>Training reports: <strong>${reports.length}</strong></p><p>Recruitment: <strong>${escapeDashboard(status)}</strong></p><a class="pcso-text-link" href="/employee/reports">Open reports →</a></section><section><h3>Ride-along activity</h3>${rideSummary(data)}</section><section><h3>Notifications</h3><p>${(data.rideAlong?.notices || []).length} unread ride-along notification(s).</p></section></div>`;
    }
    if (supervisor) {
      const ops = data.operations || {};
      const pendingRides = (data.rideAlong?.upcoming || []).length;
      supervisor.innerHTML = `<div class="pcso-stat-grid"><article><span>On duty</span><strong>${ops.deputies?.length || 0}</strong></article><article><span>Supervisors</span><strong>${(ops.deputies || []).filter((x) => x.supervisor).length}</strong></article><article><span>Ride-alongs</span><strong>${pendingRides}</strong></article><article><span>Attendance alerts</span><strong>${(ops.deputies || []).length ? 0 : 1}</strong></article></div><div class="pcso-district-grid">${(ops.districts || []).map((x) => `<article class="pcso-resource-card"><span class="pcso-resource-tag">${x.count} on duty</span><h3>${escapeDashboard(x.name)}</h3><p>Watch Commander: ${x.watchCommander ? `${escapeDashboard(x.watchCommander.rank)} ${escapeDashboard(x.watchCommander.name)}` : 'None'}</p></article>`).join('')}</div><div class="pcso-dashboard-columns"><section><h3>Pending training</h3><p>Review current sessions in Training Division and submitted results in Reports Admin.</p></section><section><h3>Activity warnings</h3><p>No live activity warnings are currently exposed to the website.</p></section><section><h3>Ride-along requests</h3><p>${pendingRides} upcoming or pending request(s).</p></section></div>`;
    }
  } catch (error) {
    const target = personal?.querySelector('[data-personal-dashboard-content]') || supervisor;
    if (target) target.innerHTML = `<p>${escapeDashboard(error.message)}</p>`;
  }
}
bootDashboard();
