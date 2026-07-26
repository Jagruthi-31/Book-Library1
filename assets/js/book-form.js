// ════════════════════════════════════════════════════════════════════════
// BOOK FORM — the Add / Edit modal. One form, two modes: openAddForm() for
// a blank record, openEditForm(book) pre-filled. Handles Open Library
// search-to-autofill and cover/PDF uploads for both.
// ════════════════════════════════════════════════════════════════════════
import { addBook, updateBook, deleteBook, uploadBookPdf } from './books-data.js';
import { getSession } from './auth.js';
import { showToast } from './toast.js';
import { searchOpenLibrary, coverThumbUrl, coverMediumUrl } from './open-library.js';

const GENRES = ['Fiction', 'Fantasy', 'Romance', 'Thriller', 'Mystery', 'Sci-Fi', 'Historical Fiction', 'Non-Fiction', 'Self-Help', 'Biography', 'Young Adult', 'Horror', 'Other'];
const FORMATS = ['Physical', 'E-book', 'Audiobook', 'Library'];
const SOURCES = ['Purchased', 'Library', 'Gift', 'Borrowed', 'Free'];
const STATUSES = ['Finished', 'Reading', 'Want to Read', 'Did Not Finish'];
const BLANK_BOOK = { title: '', author: '', genre: '', subGenre: '', status: 'Finished', format: '', source: '', pages: '', currentPage: '', cost: '', started: '', finished: '', cover: '', pdf: null, rating: 0, review: '' };
const MAX_COVER_BYTES = 5 * 1024 * 1024; // 5MB — V1 had no cap; adding one so a huge photo can't bloat every page load
const MAX_PDF_BYTES = 50 * 1024 * 1024; // matches V1's existing 50MB cap

const el = (id) => document.getElementById(id);
const toDateInputValue = (v) => (typeof v === 'string' ? v.slice(0, 10) : '');
const BOOK_ICON_SM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5C4 4.67 4.67 4 5.5 4H11a1 1 0 0 1 1 1v15a1 1 0 0 0-1-1H5.5A1.5 1.5 0 0 1 4 17.5v-12Z"/><path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H13a1 1 0 0 0-1 1v15a1 1 0 0 1 1-1h5.5a1.5 1.5 0 0 0 1.5-1.5v-12Z"/></svg>`;

let mode = 'add'; // 'add' | 'edit'
let currentBook = null;
let currentRating = 0;
let pendingCoverDataUrl = null;
let pendingPdfFile = null;
let existingPdfUrl = null;
let olTimer = null;
let onChangeCallback = () => {};

function populateSelect(select, options) {
  select.innerHTML = '<option value="">Select…</option>' + options.map((o) => `<option value="${o}">${o}</option>`).join('');
}
function paintStars() {
  el('bfRating').querySelectorAll('button').forEach((btn) => btn.classList.toggle('is-filled', Number(btn.dataset.value) <= currentRating));
}
function toggleCurrentPageField() {
  el('bfCurrentPageField').classList.toggle('hidden', el('bfStatus').value !== 'Reading');
}
function resetDeleteState() {
  el('bfDeleteIdle').classList.remove('hidden');
  el('bfDeleteConfirm').classList.add('hidden');
}
function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.classList.toggle('is-loading', loading);
  if (label) btn.querySelector('.btn-label').textContent = label;
}

/** Wires the form once. Call this on page load, before opening it. */
export function initBookForm(onChange) {
  onChangeCallback = onChange || (() => {});
  populateSelect(el('bfGenre'), GENRES);
  populateSelect(el('bfFormat'), FORMATS);
  populateSelect(el('bfSource'), SOURCES);
  populateSelect(el('bfStatus'), STATUSES);

  el('bfStatus').addEventListener('change', toggleCurrentPageField);
  el('bfCoverUrl').addEventListener('input', () => {
    pendingCoverDataUrl = null; // typing a URL overrides any just-picked file
    const url = el('bfCoverUrl').value.trim();
    el('bfCoverPreview').src = url;
    el('bfCoverPreview').classList.toggle('visible', !!url);
  });
  el('bfRating').querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = Number(btn.dataset.value);
      currentRating = currentRating === v ? 0 : v;
      paintStars();
    });
  });

  el('bfCoverUploadArea').addEventListener('click', () => el('bfCoverFile').click());
  el('bfCoverFile').addEventListener('change', handleCoverFile);
  el('bfPdfUploadArea').addEventListener('click', () => el('bfPdfFile').click());
  el('bfPdfFile').addEventListener('change', handlePdfFile);

  el('bfOlSearch').addEventListener('input', handleOlInput);
  el('bfOlClear').addEventListener('click', clearOlSearch);

  el('bfCloseBtn').addEventListener('click', closeForm);
  el('bookFormBackdrop').addEventListener('click', (e) => { if (e.target === el('bookFormBackdrop')) closeForm(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el('bookFormBackdrop').classList.contains('open')) closeForm(); });

  el('bookForm').addEventListener('submit', handleSave);
  el('bfDeleteBtn').addEventListener('click', () => {
    el('bfDeleteTitle').textContent = currentBook?.title || 'this book';
    el('bfDeleteIdle').classList.add('hidden');
    el('bfDeleteConfirm').classList.remove('hidden');
  });
  el('bfDeleteCancelBtn').addEventListener('click', resetDeleteState);
  el('bfDeleteConfirmBtn').addEventListener('click', handleDelete);
}

function populateForm(book) {
  currentRating = book.rating || 0;
  pendingCoverDataUrl = null;
  pendingPdfFile = null;
  existingPdfUrl = book.pdf || null;
  el('bfServerError').classList.add('hidden');
  clearOlSearch();
  resetDeleteState();

  el('bfTitle').value = book.title || '';
  el('bfAuthor').value = book.author || '';
  el('bfGenre').value = book.genre || '';
  el('bfSubGenre').value = book.subGenre || '';
  el('bfStatus').value = book.status || 'Finished';
  el('bfFormat').value = book.format || '';
  el('bfSource').value = book.source || '';
  el('bfPages').value = book.pages || '';
  el('bfCurrentPage').value = book.currentPage || '';
  el('bfCost').value = book.cost || '';
  el('bfStarted').value = toDateInputValue(book.started);
  el('bfFinished').value = toDateInputValue(book.finished);
  // A base64 cover would dump megabytes of text into this field, so only
  // populate it for a real pasted URL — the preview still shows either way.
  el('bfCoverUrl').value = book.cover && !book.cover.startsWith('data:') ? book.cover : '';
  el('bfCoverPreview').src = book.cover || '';
  el('bfCoverPreview').classList.toggle('visible', !!book.cover);
  el('bfPdfLabel').textContent = book.pdf ? 'PDF attached — click to replace' : 'Click to upload a PDF';
  el('bfReview').value = book.review || '';
  paintStars();
  toggleCurrentPageField();
}

export function openAddForm() {
  mode = 'add';
  currentBook = null;
  el('bfModalTitle').textContent = 'Add a book';
  el('bfDeleteZone').classList.add('hidden');
  populateForm(BLANK_BOOK);
  showModal();
}

export function openEditForm(book) {
  mode = 'edit';
  currentBook = book;
  el('bfModalTitle').textContent = 'Edit book';
  el('bfDeleteZone').classList.remove('hidden');
  populateForm(book);
  showModal();
}

function showModal() {
  el('bookFormBackdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => el('bfTitle').focus(), 200);
}
function closeForm() {
  el('bookFormBackdrop').classList.remove('open');
  document.body.style.overflow = '';
  currentBook = null;
}

/* ---------------------------------------------------------------------- *
 * Open Library search
 * ---------------------------------------------------------------------- */
function handleOlInput() {
  clearTimeout(olTimer);
  const q = el('bfOlSearch').value.trim();
  if (q.length < 2) { el('bfOlResults').classList.add('hidden'); return; }
  el('bfOlResults').classList.remove('hidden');
  el('bfOlResults').innerHTML = '<div class="ol-status">Searching…</div>';
  olTimer = setTimeout(() => runOlSearch(q), 500);
}
async function runOlSearch(q) {
  try {
    const docs = await searchOpenLibrary(q);
    renderOlResults(docs);
  } catch {
    el('bfOlResults').innerHTML = '<div class="ol-status">Search unavailable right now.</div>';
  }
}
function renderOlResults(docs) {
  if (!docs.length) { el('bfOlResults').innerHTML = '<div class="ol-status">No results found.</div>'; return; }
  el('bfOlResults').innerHTML = docs.map((d, i) => {
    const thumb = coverThumbUrl(d.cover_i);
    const cover = thumb ? `<img class="ol-thumb" src="${thumb}" alt=""/>` : `<div class="ol-thumb ol-thumb-ph">${BOOK_ICON_SM}</div>`;
    const author = (d.author_name || ['Unknown'])[0];
    const meta = [author, d.first_publish_year, d.number_of_pages_median ? `${d.number_of_pages_median} pages` : null].filter(Boolean).join(' · ');
    return `<button type="button" class="ol-item" data-index="${i}">${cover}<span class="ol-item-info"><strong>${d.title}</strong><span>${meta}</span></span></button>`;
  }).join('');
  el('bfOlResults').querySelectorAll('.ol-item').forEach((btn, i) => btn.addEventListener('click', () => fillFromOl(docs[i])));
}
function fillFromOl(d) {
  el('bfTitle').value = d.title || '';
  el('bfAuthor').value = (d.author_name || [''])[0];
  if (d.number_of_pages_median) el('bfPages').value = d.number_of_pages_median;
  if (d.cover_i) {
    const url = coverMediumUrl(d.cover_i);
    el('bfCoverUrl').value = url;
    el('bfCoverPreview').src = url;
    el('bfCoverPreview').classList.add('visible');
    pendingCoverDataUrl = null;
  }
  clearOlSearch();
  showToast('Details filled in from Open Library.', 'success');
}
function clearOlSearch() {
  el('bfOlSearch').value = '';
  el('bfOlResults').classList.add('hidden');
  el('bfOlResults').innerHTML = '';
}

/* ---------------------------------------------------------------------- *
 * File uploads
 * ---------------------------------------------------------------------- */
function handleCoverFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_COVER_BYTES) { showToast('That image is too large (max 5MB).', 'error'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingCoverDataUrl = ev.target.result;
    el('bfCoverUrl').value = '';
    el('bfCoverPreview').src = pendingCoverDataUrl;
    el('bfCoverPreview').classList.add('visible');
  };
  reader.readAsDataURL(file);
}
function handlePdfFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_PDF_BYTES) { showToast('That PDF is too large (max 50MB).', 'error'); e.target.value = ''; return; }
  pendingPdfFile = file;
  el('bfPdfLabel').textContent = `${file.name} (uploads when you save)`;
}

/* ---------------------------------------------------------------------- *
 * Save / Delete
 * ---------------------------------------------------------------------- */
async function handleSave(e) {
  e.preventDefault();
  const title = el('bfTitle').value.trim();
  const author = el('bfAuthor').value.trim();
  el('bfServerError').classList.add('hidden');
  if (!title || !author) {
    el('bfServerError').textContent = 'Title and author are both required.';
    el('bfServerError').classList.remove('hidden');
    return;
  }

  const bookId = mode === 'edit' ? currentBook.id : Date.now().toString();
  const saveBtn = el('bfSaveBtn');
  setLoading(saveBtn, true);

  let finalPdf = mode === 'edit' ? existingPdfUrl : null;
  if (pendingPdfFile) {
    const session = await getSession();
    if (!session) {
      showToast('Sign in to attach a PDF — the rest of the book will still save.', 'info');
    } else {
      setLoading(saveBtn, true, 'Uploading PDF…');
      const { url, error: pdfError } = await uploadBookPdf(bookId, pendingPdfFile);
      if (pdfError) showToast("PDF upload failed — the rest of the book will still save.", 'error');
      else finalPdf = url;
      setLoading(saveBtn, true, mode === 'add' ? 'Add book' : 'Save changes');
    }
  }

  const fields = {
    title,
    author,
    genre: el('bfGenre').value || '',
    subGenre: el('bfSubGenre').value.trim(),
    status: el('bfStatus').value || 'Finished',
    format: el('bfFormat').value || '',
    source: el('bfSource').value || '',
    pages: el('bfPages').value ? parseInt(el('bfPages').value, 10) : 0,
    currentPage: el('bfCurrentPage').value ? parseInt(el('bfCurrentPage').value, 10) : 0,
    cost: el('bfCost').value.trim(),
    started: el('bfStarted').value || null,
    finished: el('bfFinished').value || null,
    cover: pendingCoverDataUrl || el('bfCoverUrl').value.trim(),
    pdf: finalPdf,
    rating: currentRating || null,
    review: el('bfReview').value.trim(),
  };

  const { error } = mode === 'edit'
    ? await updateBook(currentBook.id, fields)
    : await addBook({ id: bookId, ...fields, favourite: false, addedAt: Date.now() });

  setLoading(saveBtn, false, mode === 'add' ? 'Add book' : 'Save changes');
  if (error) {
    el('bfServerError').textContent = "Couldn't save — check your connection and try again.";
    el('bfServerError').classList.remove('hidden');
    return;
  }
  showToast(mode === 'add' ? 'Book added.' : 'Book updated.', 'success');
  closeForm();
  onChangeCallback();
}

async function handleDelete() {
  if (!currentBook) return;
  const btn = el('bfDeleteConfirmBtn');
  setLoading(btn, true);
  const { error } = await deleteBook(currentBook.id);
  setLoading(btn, false);
  if (error) {
    showToast("Couldn't delete — check your connection and try again.", 'error');
    return;
  }
  showToast('Book deleted.', 'info');
  closeForm();
  onChangeCallback();
}
