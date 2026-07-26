// ════════════════════════════════════════════════════════════════════════
// BOOK CARD — one renderer reused across every section of Home (and, in
// Phase 3, the Library/Gallery/Tracker views too). Pure string builder: no
// event listeners live here. Callers wire interactivity via data-action.
// ════════════════════════════════════════════════════════════════════════

export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const STATUS_BADGE = {
  Reading: 'badge-reading',
  Finished: 'badge-finished',
  'Want to Read': 'badge-wishlist',
  'Did Not Finish': 'badge-dnf',
};

const PLACEHOLDER_GRADIENTS = [
  'linear-gradient(135deg, rgba(229,9,20,.35), rgba(43,10,10,.6))',
  'linear-gradient(135deg, rgba(77,166,255,.30), rgba(43,10,10,.6))',
  'linear-gradient(135deg, rgba(46,204,113,.28), rgba(43,10,10,.6))',
  'linear-gradient(135deg, rgba(255,92,138,.30), rgba(43,10,10,.6))',
];
export function placeholderGradient(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_GRADIENTS[h % PLACEHOLDER_GRADIENTS.length];
}

const BOOK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5C4 4.67 4.67 4 5.5 4H11a1 1 0 0 1 1 1v15a1 1 0 0 0-1-1H5.5A1.5 1.5 0 0 1 4 17.5v-12Z"/><path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H13a1 1 0 0 0-1 1v15a1 1 0 0 1 1-1h5.5a1.5 1.5 0 0 0 1.5-1.5v-12Z"/></svg>`;
const HEART_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.2s-7.6-4.6-9.7-9.4C.8 7.4 2.7 4 6.2 4c2 0 3.4 1 5.8 3.6C14.4 5 15.8 4 17.8 4c3.5 0 5.4 3.4 3.9 6.8-2.1 4.8-9.7 9.4-9.7 9.4Z"/></svg>`;

function starRow(rating) {
  if (!rating) return '';
  const full = Math.round(rating);
  return `<div class="book-card-stars" aria-label="${full} out of 5 stars">${'★'.repeat(full)}${'☆'.repeat(Math.max(0, 5 - full))}</div>`;
}

/**
 * @param {object} book - a book record from books-data.js
 * @param {object} [opts]
 * @param {boolean} [opts.wide] - use the wider layout (Continue Reading row) vs. the compact grid tile
 * @param {boolean} [opts.editable] - adds a click target on the body that opens the edit form (Library page only)
 */
export function renderBookCard(book, opts = {}) {
  const { wide = false, editable = false } = opts;
  const id = esc(book.id);
  const title = esc(book.title || 'Untitled');
  const author = esc(book.author || 'Unknown author');
  const badgeClass = STATUS_BADGE[book.status] || 'badge-wishlist';
  const isFav = !!book.favourite;
  const showProgress = book.status === 'Reading' && book.pages > 0;
  const pct = showProgress ? Math.min(100, Math.round(((book.currentPage || 0) / book.pages) * 100)) : 0;

  const cover = book.cover
    ? `<img src="${esc(book.cover)}" alt="" loading="lazy" class="book-cover-img"/>`
    : `<div class="book-cover-placeholder" style="background:${placeholderGradient(title)}">${BOOK_ICON}</div>`;

  return `
    <article class="book-card ${wide ? 'book-card-wide' : ''}" data-id="${id}">
      <div class="book-cover">
        ${cover}
        <button type="button" class="book-fav-btn ${isFav ? 'is-fav' : ''}" data-action="toggle-fav" aria-label="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${HEART_ICON}</button>
        <span class="badge ${badgeClass} book-card-badge"><span class="badge-dot"></span>${esc(book.status || '')}</span>
      </div>
      <div class="book-card-body" ${editable ? 'data-action="edit-book" style="cursor:pointer"' : ''}>
        <h3 class="book-card-title" title="${title}">${title}</h3>
        <p class="book-card-author">${author}</p>
        ${starRow(book.rating)}
        ${showProgress ? `
          <div class="book-progress">
            <div class="book-progress-track"><div class="book-progress-fill" style="width:${pct}%"></div></div>
            <button type="button" class="book-progress-label" data-action="edit-progress" aria-label="Update your page">${pct}% <span class="book-progress-edit-hint">· edit</span></button>
          </div>` : ''}
      </div>
      ${book.pdf ? `<button type="button" class="btn btn-ghost btn-block book-card-cta" data-action="open-book">${book.status === 'Reading' ? 'Continue reading' : 'Open book'}</button>` : ''}
    </article>`;
}

/** Compact row for the Library table view. Click anywhere on the row to edit. */
export function renderBookRow(book) {
  const id = esc(book.id);
  const title = esc(book.title || 'Untitled');
  const author = esc(book.author || 'Unknown author');
  const badgeClass = STATUS_BADGE[book.status] || 'badge-wishlist';
  const isFav = !!book.favourite;
  const cover = book.cover
    ? `<img src="${esc(book.cover)}" alt="" loading="lazy" class="row-cover-img"/>`
    : `<div class="row-cover-placeholder" style="background:${placeholderGradient(title)}">${BOOK_ICON}</div>`;

  return `
    <div class="book-row" data-id="${id}" data-action="edit-book" role="button" tabindex="0">
      <div class="row-cover">${cover}</div>
      <div class="row-main">
        <div class="row-title">${title}</div>
        <div class="row-author">${author}</div>
      </div>
      <div class="row-genre text-muted">${esc(book.genre || '—')}</div>
      <span class="badge ${badgeClass}"><span class="badge-dot"></span>${esc(book.status || '')}</span>
      <div class="row-rating">${book.rating ? '★'.repeat(Math.round(book.rating)) : '—'}</div>
      <button type="button" class="book-fav-btn row-fav-btn ${isFav ? 'is-fav' : ''}" data-action="toggle-fav" aria-label="${isFav ? 'Remove from favorites' : 'Add to favorites'}">${HEART_ICON}</button>
    </div>`;
}

export function renderEmptyRow(message) {
  return `<div class="empty-row"><p class="text-muted">${esc(message)}</p></div>`;
}
