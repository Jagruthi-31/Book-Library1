// ════════════════════════════════════════════════════════════════════════
// LIBRARY PAGE — every book, searchable/filterable/sortable, in grid or
// table form. Editing and deleting both live in book-form.js; this file
// owns rendering and the toolbar state only.
// ════════════════════════════════════════════════════════════════════════
import { onAuthChange } from './auth.js';
import { showToast } from './toast.js';
import { loadLibrary, getLibrary, toggleFavorite } from './books-data.js';
import { renderBookCard, renderBookRow, renderEmptyRow } from './book-card.js';
import { initBookForm, openEditForm, openAddForm } from './book-form.js';
import { startProgressEdit } from './progress-edit.js';

const el = (id) => document.getElementById(id);
const VIEW_KEY = 'bp2_library_view';

const state = {
  search: '',
  status: '',
  genre: '',
  author: '',
  sort: 'recent',
  view: localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid',
};

function getFiltered() {
  let books = getLibrary();

  if (state.search) {
    const q = state.search.toLowerCase();
    books = books.filter((b) => (b.title || '').toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q));
  }
  if (state.status) books = books.filter((b) => b.status === state.status);
  if (state.genre) books = books.filter((b) => b.genre === state.genre);
  if (state.author) books = books.filter((b) => b.author === state.author);

  books = [...books];
  if (state.sort === 'title') books.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  else if (state.sort === 'author') books.sort((a, b) => (a.author || '').localeCompare(b.author || ''));
  else if (state.sort === 'rating') books.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else books.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)); // 'recent' (default)

  return books;
}

function populateGenreFilter() {
  const genres = [...new Set(getLibrary().map((b) => b.genre).filter(Boolean))].sort();
  const select = el('filterGenre');
  const current = select.value;
  select.innerHTML = '<option value="">All genres</option>' + genres.map((g) => `<option value="${g}">${g}</option>`).join('');
  if (genres.includes(current)) select.value = current;
}

function populateAuthorFilter() {
  const authors = [...new Set(getLibrary().map((b) => b.author).filter(Boolean))].sort();
  const select = el('filterAuthor');
  const current = select.value;
  select.innerHTML = '<option value="">All authors</option>' + authors.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  if (authors.includes(current)) select.value = current;
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setView(view) {
  state.view = view;
  localStorage.setItem(VIEW_KEY, view);
  el('viewGridBtn').classList.toggle('active', view === 'grid');
  el('viewTableBtn').classList.toggle('active', view === 'table');
  renderContent();
}

function renderContent() {
  const total = getLibrary().length;
  el('libraryEmptyState').classList.toggle('hidden', total > 0);
  el('libraryToolbarWrap').classList.toggle('hidden', total === 0);
  el('libraryContent').classList.toggle('hidden', total === 0);
  if (!total) return;

  const books = getFiltered();
  el('libraryCount').textContent = `${books.length} book${books.length === 1 ? '' : 's'}`;

  if (!books.length) {
    el('libraryContent').innerHTML = renderEmptyRow('No books match your search and filters.');
    return;
  }
  el('libraryContent').innerHTML =
    state.view === 'table'
      ? `<div class="book-rows">${books.map((b) => renderBookRow(b)).join('')}</div>`
      : `<div class="card-grid">${books.map((b) => renderBookCard(b, { editable: true })).join('')}</div>`;
}

/* ---------------------------------------------------------------------- *
 * Toolbar wiring
 * ---------------------------------------------------------------------- */
let searchTimer;
el('librarySearchInput')?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = el('librarySearchInput').value.trim();
    renderContent();
  }, 200);
});
el('filterStatus')?.addEventListener('change', () => { state.status = el('filterStatus').value; renderContent(); });
el('filterGenre')?.addEventListener('change', () => { state.genre = el('filterGenre').value; renderContent(); });
el('filterAuthor')?.addEventListener('change', () => { state.author = el('filterAuthor').value; renderContent(); });
el('sortSelect')?.addEventListener('change', () => { state.sort = el('sortSelect').value; renderContent(); });
el('viewGridBtn')?.addEventListener('click', () => setView('grid'));
el('viewTableBtn')?.addEventListener('click', () => setView('table'));
el('addBookBtn')?.addEventListener('click', () => openAddForm());
el('addBookBtnEmpty')?.addEventListener('click', () => openAddForm());

/* ---------------------------------------------------------------------- *
 * Delegated interactions (grid cards + table rows share these actions)
 * ---------------------------------------------------------------------- */
el('libraryContent')?.addEventListener('click', async (e) => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  const item = actionEl.closest('[data-id]');
  if (!item) return;
  const id = item.dataset.id;
  const book = getLibrary().find((b) => b.id === id);
  if (!book) return;

  if (actionEl.dataset.action === 'toggle-fav') {
    const { error, favourite } = await toggleFavorite(id);
    if (error) { showToast("Couldn't save that — check your connection.", 'error'); return; }
    actionEl.classList.toggle('is-fav', favourite);
    actionEl.setAttribute('aria-label', favourite ? 'Remove from favorites' : 'Add to favorites');
  } else if (actionEl.dataset.action === 'edit-book') {
    openEditForm(book);
  } else if (actionEl.dataset.action === 'open-book') {
    if (book.pdf) location.href = `reader.html?id=${encodeURIComponent(book.id)}`;
  } else if (actionEl.dataset.action === 'edit-progress') {
    startProgressEdit(item, book, renderContent);
  }
});
// Keyboard access for table rows (which are role="button" tabindex="0")
el('libraryContent')?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target !== e.target.closest('.book-row')) return; // ignore key events bubbling from child buttons
  const row = e.target.closest('.book-row');
  const book = getLibrary().find((b) => b.id === row.dataset.id);
  if (book) { e.preventDefault(); openEditForm(book); }
});

/* ---------------------------------------------------------------------- *
 * Boot
 * ---------------------------------------------------------------------- */
async function boot() {
  await loadLibrary();
  populateGenreFilter();
  populateAuthorFilter();
  el('viewGridBtn').classList.toggle('active', state.view === 'grid');
  el('viewTableBtn').classList.toggle('active', state.view === 'table');
  renderContent();

  const openId = new URLSearchParams(location.search).get('open');
  if (openId) {
    const book = getLibrary().find((b) => b.id === openId);
    if (book) openEditForm(book);
    history.replaceState(null, '', location.pathname); // don't reopen if the user refreshes
  }
}

initBookForm(() => { populateGenreFilter(); populateAuthorFilter(); renderContent(); });
boot();
onAuthChange(() => boot());
