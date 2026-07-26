// ════════════════════════════════════════════════════════════════════════
// DASHBOARD — the analytics view: streak, reading hours, this year's goal
// progress, a month-by-month bar chart, and genre/format/source breakdowns.
// ════════════════════════════════════════════════════════════════════════
import {
  loadLibrary, loadSessions, getStreak, getReadingHours, getYearlyGoalStats, setGoal,
  getMonthlyFinished, getGenreBreakdown, getFormatBreakdown, getSourceBreakdown,
} from './books-data.js';
import { showToast } from './toast.js';

const el = (id) => document.getElementById(id);
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DONUT_COLORS = ['var(--accent)', 'var(--info)', 'var(--success)', 'var(--favorite)', 'var(--text-tertiary)', 'var(--danger)'];
const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>`;
const FLAME_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5s-1 3-3.5 5.5C6 10.5 5 12.5 5 15a7 7 0 0 0 14 0c0-2-.7-3.3-2-4.5.3 1.5-.3 2.5-1 3-.3-2.5-1.5-4-3-5.5C13.5 6.5 13 4.5 12 2.5Z"/></svg>`;

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------------------------------------------------------------- *
 * Streak + reading hours
 * ---------------------------------------------------------------------- */
function renderStreak() {
  const streak = getStreak();
  el('streakCard').innerHTML = `
    <div class="streak-badge">
      <div class="streak-flame">${FLAME_ICON}</div>
      <div><div class="streak-value">${streak}</div><div class="streak-label">day${streak === 1 ? '' : 's'} in a row</div></div>
    </div>`;
}

function renderReadingHours() {
  const { totalHours, monthHours } = getReadingHours();
  el('hoursCard').innerHTML = `
    <div class="stat-value">${totalHours.toFixed(1)}<span style="font-size:0.9rem;color:var(--text-tertiary);"> hrs</span></div>
    <div class="stat-label">Total time reading</div>
    <p class="text-muted" style="font-size:12px;margin-top:10px;">${monthHours.toFixed(1)} hrs this month</p>`;
}

/* ---------------------------------------------------------------------- *
 * Goal card (with inline editing)
 * ---------------------------------------------------------------------- */
function renderGoal() {
  const { finishedThisYear, goal, pct, year } = getYearlyGoalStats();
  if (!goal) {
    el('goalCard').innerHTML = `
      <p class="text-muted" style="font-size:13px;margin-bottom:12px;">No reading goal set for ${year} yet.</p>
      <button type="button" class="btn btn-ghost" id="setGoalBtn">Set a goal</button>`;
    el('setGoalBtn').addEventListener('click', () => startGoalEdit(0));
    return;
  }
  const R = 40, C = 2 * Math.PI * R;
  const offset = C - (C * pct) / 100;
  el('goalCard').innerHTML = `
    <div class="flex items-center gap-4">
      <div class="goal-ring-wrap">
        <svg viewBox="0 0 96 96">
          <circle class="goal-ring-track" cx="48" cy="48" r="${R}"/>
          <circle class="goal-ring-fill" cx="48" cy="48" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
        </svg>
        <div class="goal-ring-text"><strong>${pct}%</strong><span>${year}</span></div>
      </div>
      <div>
        <p style="font-size:14px;font-weight:600;">${finishedThisYear} of ${goal} books</p>
        <button type="button" class="btn-text" id="editGoalBtn" style="margin-top:6px;">Edit goal</button>
      </div>
    </div>`;
  el('editGoalBtn').addEventListener('click', () => startGoalEdit(goal));
}

function startGoalEdit(current) {
  const wrap = document.createElement('div');
  wrap.className = 'progress-edit';
  wrap.style.marginTop = '8px';
  wrap.innerHTML = `<input type="number" min="1" max="999" value="${current || ''}" placeholder="e.g. 24" aria-label="Yearly goal"/>
    <button type="button" class="progress-edit-confirm" aria-label="Save">${CHECK_ICON}</button>`;
  const anchor = el('editGoalBtn') || el('setGoalBtn');
  anchor.replaceWith(wrap);
  const input = wrap.querySelector('input');
  input.focus();
  input.select();
  const commit = async () => {
    const val = Math.max(1, parseInt(input.value, 10) || 0);
    if (!val) return;
    const { error } = await setGoal(val);
    if (error) showToast("Couldn't save your goal — check your connection.", 'error');
    else showToast('Reading goal updated.', 'success');
    renderGoal();
  };
  wrap.querySelector('.progress-edit-confirm').addEventListener('click', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
}

/* ---------------------------------------------------------------------- *
 * Year in Books — bar chart
 * ---------------------------------------------------------------------- */
function renderYearInBooks() {
  const counts = getMonthlyFinished();
  const max = Math.max(1, ...counts);
  const currentMonth = new Date().getMonth();
  el('yearInBooksChart').innerHTML = `
    <div class="bar-chart">
      ${counts.map((c, i) => {
        const heightPct = Math.max(4, Math.round((c / max) * 100));
        const cls = ['bar-chart-bar', c > 0 ? 'has-value' : '', i === currentMonth ? 'is-current-month' : ''].filter(Boolean).join(' ');
        return `<div class="bar-chart-col" title="${MONTH_LABELS[i]}: ${c} finished">
          <div class="${cls}" style="height:${heightPct}%"></div>
          <span class="bar-chart-label">${MONTH_LABELS[i]}</span>
        </div>`;
      }).join('')}
    </div>`;
}

/* ---------------------------------------------------------------------- *
 * Donut chart (genre) + bar lists (format, source)
 * ---------------------------------------------------------------------- */
function capSegments(segments, max = 5) {
  if (segments.length <= max) return segments;
  const top = segments.slice(0, max);
  const otherValue = segments.slice(max).reduce((s, x) => s + x.value, 0);
  return [...top, { label: 'Other', value: otherValue }];
}

function renderDonut(containerEl, rawSegments) {
  const segments = capSegments(rawSegments);
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) { containerEl.innerHTML = '<p class="text-muted" style="font-size:13px;">No data yet.</p>'; return; }
  const size = 132, strokeWidth = 16;
  const R = (size - strokeWidth) / 2;
  const C = 2 * Math.PI * R;
  const cx = size / 2, cy = size / 2;
  let offset = 0;
  let circles = '';
  let legend = '';
  segments.forEach((seg, i) => {
    const arc = (seg.value / total) * C;
    const color = DONUT_COLORS[i % DONUT_COLORS.length];
    circles += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" style="stroke:${color}" stroke-width="${strokeWidth}" stroke-dasharray="${arc.toFixed(2)} ${(C - arc).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
    legend += `<div class="donut-legend-item"><span class="donut-legend-dot" style="background:${color}"></span><span class="donut-legend-label">${esc(seg.label)}</span><span class="donut-legend-value">${seg.value}</span></div>`;
    offset += arc;
  });
  containerEl.innerHTML = `
    <div class="donut-wrap">
      <svg class="donut-svg" viewBox="0 0 ${size} ${size}">
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" style="stroke:var(--bg-surface-3)" stroke-width="${strokeWidth}"/>
        ${circles}
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>`;
}

function renderBarList(containerEl, segments, max = 6) {
  const capped = segments.slice(0, max);
  const maxVal = Math.max(1, ...capped.map((s) => s.value));
  if (!capped.length) { containerEl.innerHTML = '<p class="text-muted" style="font-size:13px;">No data yet.</p>'; return; }
  containerEl.innerHTML = `<div class="bar-list">${capped.map((s) => `
    <div class="bar-list-row">
      <span class="bar-list-label">${esc(s.label)}</span>
      <div class="bar-list-track"><div class="bar-list-fill" style="width:${Math.round((s.value / maxVal) * 100)}%"></div></div>
      <span class="bar-list-count">${s.value}</span>
    </div>`).join('')}</div>`;
}

/* ---------------------------------------------------------------------- *
 * Boot
 * ---------------------------------------------------------------------- */
async function boot() {
  await loadLibrary();
  await loadSessions();
  renderStreak();
  renderReadingHours();
  renderGoal();
  renderYearInBooks();
  renderDonut(el('genreDonut'), getGenreBreakdown());
  renderBarList(el('formatBarList'), getFormatBreakdown());
  renderBarList(el('sourceBarList'), getSourceBreakdown());
  el('dashboardContent').classList.remove('hidden');
  el('dashboardLoading').classList.add('hidden');
}

boot();
