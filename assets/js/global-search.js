// ════════════════════════════════════════════════════════════════════════
// GLOBAL SEARCH — Cmd/Ctrl+K from anywhere. Loaded on Home, Library, and
// Dashboard (not the Reader, which stays deliberately chrome-free).
//
// Path handling: this same file runs from the site root (index.html) AND
// from inside pages/ (library.html, dashboard.html), so every internal link
// it builds is computed relative to wherever it's currently running.
// ════════════════════════════════════════════════════════════════════════
import { loadLibrary, getLibrary, getContinueReading } from './books-data.js';

const el = (id) => document.getElementById(id);
const HISTORY_KEY = 'bp2_search_history';
const MAX_HISTORY = 8;
const STATUS_BADGE = { Reading: 'badge-reading', Finished: 'badge-finished', 'Want to Read': 'badge-wishlist', 'Did Not Finish': 'badge-dnf' };

const inPagesDir = location.pathname.includes('/pages/');
const pagesPrefix = inPagesDir ? '' : 'pages/';

let activeIndex = -1;
let currentResults = [];
let libraryReady = false;

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveHistory(list) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch { /* best-effort only */ }
}
function addToHistory(term) {
  const trimmed = term.trim();
  if (trimmed.length < 2) return;
  const history = [trimmed, ...loadHistory().filter((h) => h.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_HISTORY);
  saveHistory(history);
}

/* ---------------------------------------------------------------------- *
 * Rendering
 * ---------------------------------------------------------------------- */
function renderResultRow(book, index) {
  const badgeClass = STATUS_BADGE[book.status] || 'badge-wishlist';
  return `
    <button type="button" class="search-result-row ${index === activeIndex ? 'is-active' : ''}" data-index="${index}">
      <span class="search-result-info">
        <span class="search-result-title">${esc(book.title || 'Untitled')}</span>
        <span class="search-result-author">${esc(book.author || 'Unknown author')}</span>
      </span>
      <span class="badge ${badgeClass}"><span class="badge-dot"></span>${esc(book.status || '')}</span>
    </button>`;
}

function renderEmptyState() {
  currentResults = [];
  activeIndex = -1;
  const history = loadHistory();
  const continuing = getContinueReading().slice(0, 3);
  let html = '';

  if (history.length) {
    html += `<div class="search-section-label">Recent searches</div>
      <div class="search-history-chips">
        ${history.map((h) => `<button type="button" class="search-history-chip" data-term="${esc(h)}">${esc(h)}</button>`).join('')}
        <button type="button" class="search-history-clear" id="clearHistoryBtn">Clear</button>
      </div>`;
  }
  if (continuing.length) {
    currentResults = continuing;
    html += `<div class="search-section-label" style="margin-top:${history.length ? '18px' : '2px'};">Continue reading</div>
      ${continuing.map((b, i) => renderResultRow(b, i)).join('')}`;
  }
  if (!history.length && !continuing.length) {
    html += `<p class="text-muted" style="font-size:13px;padding:14px 4px;">Start typing to search your library.</p>`;
  }
  el('searchResultsArea').innerHTML = html;

  el('searchResultsArea').querySelectorAll('.search-history-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      el('globalSearchInput').value = chip.dataset.term;
      runSearch(chip.dataset.term);
      el('globalSearchInput').focus();
    });
  });
  el('clearHistoryBtn')?.addEventListener('click', () => { saveHistory([]); renderEmptyState(); });
}

function runSearch(query) {
  const q = query.trim().toLowerCase();
  activeIndex = -1;
  if (!q) { renderEmptyState(); return; }
  const results = getLibrary()
    .filter((b) => (b.title || '').toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q))
    .slice(0, 8);
  currentResults = results;
  el('searchResultsArea').innerHTML = results.length
    ? results.map((b, i) => renderResultRow(b, i)).join('')
    : `<p class="text-muted" style="font-size:13px;padding:14px 4px;">No books match "${esc(query)}".</p>`;
}

/* ---------------------------------------------------------------------- *
 * Open / close / navigate
 * ---------------------------------------------------------------------- */
function openSearch() {
  el('searchBackdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
  el('globalSearchInput').value = '';
  renderEmptyState();
  setTimeout(() => el('globalSearchInput').focus(), 150);
  if (!libraryReady) { loadLibrary().then(() => { libraryReady = true; renderEmptyState(); }); }
}
function closeSearch() {
  el('searchBackdrop').classList.remove('open');
  document.body.style.overflow = '';
}
function moveActive(delta) {
  if (!currentResults.length) return;
  activeIndex = (activeIndex + delta + currentResults.length) % currentResults.length;
  el('searchResultsArea').querySelectorAll('.search-result-row').forEach((row, i) => row.classList.toggle('is-active', i === activeIndex));
  el('searchResultsArea').querySelectorAll('.search-result-row')[activeIndex]?.scrollIntoView({ block: 'nearest' });
}
function selectResult(index) {
  const book = currentResults[index];
  if (!book) return;
  if (el('globalSearchInput').value.trim()) addToHistory(el('globalSearchInput').value);
  closeSearch();
  location.href = book.pdf
    ? `${pagesPrefix}reader.html?id=${encodeURIComponent(book.id)}`
    : `${pagesPrefix}library.html?open=${encodeURIComponent(book.id)}`;
}

/* ---------------------------------------------------------------------- *
 * Wiring
 * ---------------------------------------------------------------------- */
el('globalSearchBtn')?.addEventListener('click', openSearch);
el('searchCloseBtn')?.addEventListener('click', closeSearch);
el('searchBackdrop')?.addEventListener('click', (e) => { if (e.target === el('searchBackdrop')) closeSearch(); });
el('globalSearchInput')?.addEventListener('input', (e) => runSearch(e.target.value));
el('searchResultsArea')?.addEventListener('click', (e) => {
  const row = e.target.closest('.search-result-row');
  if (row) selectResult(Number(row.dataset.index));
});

document.addEventListener('keydown', (e) => {
  const isMac = navigator.platform?.toUpperCase().includes('MAC');
  const shortcutHeld = isMac ? e.metaKey : e.ctrlKey;
  if (shortcutHeld && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    el('searchBackdrop').classList.contains('open') ? closeSearch() : openSearch();
    return;
  }
  if (!el('searchBackdrop')?.classList.contains('open')) return;
  if (e.key === 'Escape') closeSearch();
  else if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    selectResult(activeIndex >= 0 ? activeIndex : 0);
  }
});

// Load library data quietly in the background so the first search is instant.
loadLibrary().then(() => { libraryReady = true; });
