// ════════════════════════════════════════════════════════════════════════
// HOME — page controller for the Home/Library landing view.
// Renders from books-data.js and re-renders only the section that changed
// after a mutation, so favoriting a book doesn't reshuffle the whole page.
// ════════════════════════════════════════════════════════════════════════
import { getSession, onAuthChange } from './auth.js';
import { showToast } from './toast.js';
import {
  loadLibrary, getLibrary, getStats, getContinueReading,
  getRecentlyAdded, getFavorites, getCategories, getRecommended,
  toggleFavorite,
} from './books-data.js';
import { renderBookCard, renderEmptyRow } from './book-card.js';
import { startProgressEdit } from './progress-edit.js';

const el = (id) => document.getElementById(id);
const homeContent = el('homeContent');
const homeEmpty = el('homeEmptyState');

/* ---------------------------------------------------------------------- *
 * Greeting
 * ---------------------------------------------------------------------- */
function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
async function renderGreeting() {
  const session = await getSession();
  const name = session?.user?.user_metadata?.display_name?.trim().split(' ')[0];
  el('greetingText').textContent = name ? `${timeGreeting()}, ${name}.` : `${timeGreeting()}.`;
  const s = getStats();
  el('greetingSub').textContent = s.total
    ? `${s.total} book${s.total === 1 ? '' : 's'} on your shelf${s.reading ? ` · ${s.reading} in progress` : ''}`
    : 'Your shelf is ready whenever you are.';
}

/* ---------------------------------------------------------------------- *
 * Dynamic hero — tints the ambient glow behind the greeting with a color
 * sampled from the currently-reading book's cover, Apple-Books-style.
 * Best-effort: covers hosted without CORS headers can't be read pixel-by-
 * pixel, so any failure here just leaves the default accent-colored glow.
 * ---------------------------------------------------------------------- */
function sampleCoverColor(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 20;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue; // skip transparent pixels
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        if (!n) return resolve(null);
        resolve(`${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)}`);
      } catch (err) {
        reject(err); // most likely a CORS-tainted canvas
      }
    };
    img.onerror = reject;
    img.src = src;
  });
}

async function applyHeroColor() {
  const current = getContinueReading()[0];
  if (!current?.cover) return;
  try {
    const rgb = await sampleCoverColor(current.cover);
    if (rgb) document.documentElement.style.setProperty('--hero-rgb', rgb);
  } catch {
    /* cover isn't CORS-readable — keep the default accent-colored glow */
  }
}

/* ---------------------------------------------------------------------- *
 * Stats + goal ring
 * ---------------------------------------------------------------------- */
function renderStats() {
  const s = getStats();
  el('statsGrid').innerHTML = `
    <div class="card stat-card gilt-edge"><div class="stat-value">${s.total}</div><div class="stat-label">Total books</div></div>
    <div class="card stat-card gilt-edge"><div class="stat-value">${s.reading}</div><div class="stat-label">Currently reading</div></div>
    <div class="card stat-card gilt-edge"><div class="stat-value">${s.finished}</div><div class="stat-label">Finished</div></div>
    <div class="card stat-card gilt-edge"><div class="stat-value">${s.avgRating ? s.avgRating.toFixed(1) : '—'}</div><div class="stat-label">Avg. rating</div></div>
  `;

  const ring = el('goalRingCard');
  if (!s.goal) {
    ring.innerHTML = `<p class="text-muted" style="font-size:13px;">No reading goal set yet. (Set one from Backup &amp; Sync in V1 for now — a proper Settings page is coming in a later phase.)</p>`;
    return;
  }
  const R = 40, C = 2 * Math.PI * R;
  const offset = C - (C * s.goalPct) / 100;
  ring.innerHTML = `
    <div class="goal-ring-wrap">
      <svg viewBox="0 0 96 96">
        <circle class="goal-ring-track" cx="48" cy="48" r="${R}"/>
        <circle class="goal-ring-fill" cx="48" cy="48" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
      </svg>
      <div class="goal-ring-text"><strong>${s.goalPct}%</strong><span>of ${s.goal}</span></div>
    </div>
    <div><p style="font-size:14px;font-weight:600;">${s.finished} of ${s.goal} books</p><p class="text-muted" style="font-size:12.5px;">your reading goal this year</p></div>
  `;
}

/* ---------------------------------------------------------------------- *
 * Book rows
 * ---------------------------------------------------------------------- */
function renderRow(containerId, sectionId, books, opts) {
  const container = el(containerId);
  if (!container) return;
  if (!books.length) {
    container.innerHTML = renderEmptyRow(opts.emptyMessage);
  } else {
    container.innerHTML = books.map((b) => renderBookCard(b, opts)).join('');
  }
  if (sectionId) el(sectionId)?.classList.toggle('hidden', opts.hideIfEmpty ? books.length === 0 : false);
}

function renderContinueReading() {
  renderRow('continueReadingRow', 'continueReadingSection', getContinueReading(), {
    wide: true, hideIfEmpty: true, emptyMessage: "Nothing in progress right now.",
  });
}
function renderRecentlyAdded() {
  renderRow('recentlyAddedRow', null, getRecentlyAdded(10), { emptyMessage: 'Add a book and it will show up here.' });
}
function renderFavorites() {
  renderRow('favoritesRow', 'favoritesSection', getFavorites(10), {
    hideIfEmpty: true, emptyMessage: 'Tap the heart on any book to see it here.',
  });
}
function renderRecommended() {
  renderRow('recommendedRow', 'recommendedSection', getRecommended(6), {
    hideIfEmpty: true, emptyMessage: '',
  });
}
function renderCategories() {
  const cats = getCategories(8);
  const row = el('categoriesRow');
  el('categoriesSection')?.classList.toggle('hidden', cats.length === 0);
  row.innerHTML = cats.map((c) => `<span class="category-chip">${c.genre}<span class="count">${c.count}</span></span>`).join('');
}

function renderAllRows() {
  renderContinueReading();
  renderRecentlyAdded();
  renderFavorites();
  renderRecommended();
  renderCategories();
}

/* ---------------------------------------------------------------------- *
 * Delegated interactions — one listener covers every row on the page
 * ---------------------------------------------------------------------- */
homeContent?.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const card = actionEl.closest('.book-card');
  if (!card) return;
  const id = card.dataset.id;
  const book = getLibrary().find((b) => b.id === id);
  if (!book) return;

  if (actionEl.dataset.action === 'toggle-fav') {
    const { error, favourite } = await toggleFavorite(id);
    if (error) { showToast("Couldn't save that — check your connection.", 'error'); return; }
    actionEl.classList.toggle('is-fav', favourite);
    actionEl.setAttribute('aria-label', favourite ? 'Remove from favorites' : 'Add to favorites');
    renderFavorites();
  } else if (actionEl.dataset.action === 'open-book') {
    if (book.pdf) location.href = `pages/reader.html?id=${encodeURIComponent(book.id)}`;
  } else if (actionEl.dataset.action === 'edit-progress') {
    startProgressEdit(card, book, renderContinueReading);
  }
});


/* ---------------------------------------------------------------------- *
 * Boot
 * ---------------------------------------------------------------------- */
async function boot() {
  await loadLibrary();
  const hasBooks = getLibrary().length > 0;
  homeEmpty?.classList.toggle('hidden', hasBooks);
  homeContent?.classList.toggle('hidden', !hasBooks);
  if (!hasBooks) {
    const session = await getSession();
    el('homeEmptyMessage').textContent = session
      ? "Your shelf is empty so far — Library management (adding books, PDFs, and covers) arrives in the next phase."
      : 'Sign in to load your library, or check back once the next phase adds a way to add books here directly.';
    return;
  }
  await renderGreeting();
  renderStats();
  renderAllRows();
  applyHeroColor();
}

boot();
onAuthChange(() => boot()); // re-load from the cloud the moment sign-in state changes
