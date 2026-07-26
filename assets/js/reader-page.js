// ════════════════════════════════════════════════════════════════════════
// READER — in-app PDF viewing. Loaded from pages/reader.html?id=<bookId>.
// Uses PDF.js (imported directly as an ES module from jsDelivr — v6.1.200,
// the current stable release as of this build).
//
// A few things worth knowing if you touch this file:
//  - Pages render lazily, one at a time — never the whole document at once.
//  - Every render tracks its task and cancels any in-flight one first, so
//    clicking "next" twice quickly can't race two renders onto one canvas
//    (this is a documented PDF.js pitfall, not a hypothetical one).
//  - page.cleanup() runs after each render and pdfDoc.destroy() runs on
//    unload, so a long reading session doesn't quietly leak memory.
// ════════════════════════════════════════════════════════════════════════
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.mjs';
import { loadLibrary, getLibrary, updateProgress, logReadingSession } from './books-data.js';
import { showToast } from './toast.js';

const PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/';
pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}build/pdf.worker.mjs`;

const el = (id) => document.getElementById(id);
const DARK_READ_KEY = 'bp2_reader_dark';
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];

const params = new URLSearchParams(location.search);
const bookId = params.get('id');

let pdfDoc = null;
let book = null;
let currentPage = 1;
let totalPages = 1;
let scale = 1;
let renderTask = null;
let saveTimer = null;
let sessionStart = Date.now();
let lastLoggedAt = Date.now();
let darkReadingMode = localStorage.getItem(DARK_READ_KEY) === '1';
let fitMode = 'width'; // 'width' | 'page' | null (null once the user manually zooms)

function showError(message) {
  el('readerLoading').classList.add('hidden');
  el('readerError').classList.remove('hidden');
  el('readerErrorMsg').textContent = message;
}

function goBack() {
  if (history.length > 1) history.back();
  else location.href = '../index.html';
}

async function boot() {
  if (!bookId) { showError('No book was specified.'); return; }

  await loadLibrary();
  book = getLibrary().find((b) => b.id === bookId);
  if (!book) { showError('This book could not be found in your library.'); return; }
  if (!book.pdf) { showError("This book doesn't have a PDF attached yet."); return; }

  el('readerTitle').textContent = book.title || 'Untitled';
  document.title = `${book.title || 'Reading'} — Booked & Planned`;
  el('readerDarkToggle').classList.toggle('active', darkReadingMode);
  el('pdfCanvas').classList.toggle('reader-invert', darkReadingMode);

  let loadingTask;
  let passwordHandled = false;
  try {
    loadingTask = pdfjsLib.getDocument({
      url: book.pdf,
      cMapUrl: `${PDFJS_BASE}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_BASE}standard_fonts/`,
    });
    loadingTask.onPassword = (_updatePassword, _reason) => {
      passwordHandled = true;
      showError("This PDF is password-protected, which the reader doesn't support yet.");
      loadingTask.destroy();
    };
    pdfDoc = await loadingTask.promise;
  } catch (err) {
    if (!passwordHandled) showError("Couldn't open this PDF. It may have been moved or deleted.");
    return;
  }
  if (!pdfDoc) return; // onPassword already showed an error and bailed

  totalPages = pdfDoc.numPages;
  currentPage = Math.min(Math.max(1, book.currentPage || 1), totalPages);

  await fitToWidth();
  el('readerLoading').classList.add('hidden');
  el('readerBar').classList.remove('hidden');
  el('readerViewport').classList.remove('hidden');
  el('readerProgressTrack').classList.remove('hidden');
  await renderPage(currentPage);
  startSessionTimer();
}

async function fitToWidth() {
  const page = await pdfDoc.getPage(currentPage);
  const native = page.getViewport({ scale: 1 });
  const available = el('readerViewport').clientWidth - 48;
  scale = Math.min(2.5, Math.max(0.5, available / native.width));
  updateZoomLabel();
}

async function fitToPage() {
  const page = await pdfDoc.getPage(currentPage);
  const native = page.getViewport({ scale: 1 });
  const viewport = el('readerViewport');
  const availableW = viewport.clientWidth - 48;
  const availableH = viewport.clientHeight - 48;
  scale = Math.min(2.5, Math.max(0.5, Math.min(availableW / native.width, availableH / native.height)));
  updateZoomLabel();
}

function updateFitButtons() {
  el('fitWidthBtn').classList.toggle('active', fitMode === 'width');
  el('fitPageBtn').classList.toggle('active', fitMode === 'page');
}

async function setFitMode(mode) {
  fitMode = mode;
  updateFitButtons();
  if (mode === 'width') await fitToWidth();
  else await fitToPage();
  renderPage(currentPage);
}

async function renderPage(num) {
  // Commit to the new page immediately — indicator, button states, and the
  // save timer all reflect intent right away, not whenever rendering finishes.
  currentPage = num;
  updatePageIndicator();
  scheduleProgressSave();

  if (renderTask) {
    renderTask.cancel();
    renderTask = null;
  }
  let page;
  try {
    page = await pdfDoc.getPage(num);
  } catch {
    showToast("Couldn't load that page.", 'error');
    return;
  }
  if (num !== currentPage) return; // superseded by a later navigation while this was loading

  // Render at device-pixel resolution, not CSS-pixel resolution — otherwise every
  // Retina/high-DPI screen (most phones and laptops) stretches a lower-res bitmap
  // and the page looks soft/blurry even though PDF.js rendered it perfectly.
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const viewport = page.getViewport({ scale }); // logical size — used for on-screen (CSS) dimensions
  const renderViewport = page.getViewport({ scale: scale * dpr }); // actual pixel data rendered at this size
  const canvas = el('pdfCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = renderViewport.width;
  canvas.height = renderViewport.height;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  el('canvasWrap').style.opacity = '0.35';
  try {
    renderTask = page.render({ canvasContext: ctx, viewport: renderViewport });
    await renderTask.promise;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') showToast('There was a problem rendering this page.', 'error');
    return;
  } finally {
    renderTask = null;
  }
  if (num !== currentPage) return; // superseded mid-render; the newer render owns the canvas now
  el('canvasWrap').style.opacity = '1';
  page.cleanup();
}

function updatePageIndicator() {
  el('readerPageCurrentBtn').textContent = currentPage;
  el('readerPageTotal').textContent = totalPages;
  el('readerPageCurrentInput').max = totalPages;
  el('readerProgressFill').style.width = `${Math.round((currentPage / totalPages) * 100)}%`;
  el('prevPageBtn').disabled = currentPage <= 1;
  el('nextPageBtn').disabled = currentPage >= totalPages;
}

function openPageEdit() {
  const input = el('readerPageCurrentInput');
  input.value = currentPage;
  el('readerPageCurrentBtn').classList.add('hidden');
  input.classList.remove('hidden');
  input.focus();
  input.select();
}
function closePageEdit(commit) {
  const input = el('readerPageCurrentInput');
  if (commit) {
    const val = parseInt(input.value, 10);
    if (val && val !== currentPage) goToPage(val);
  }
  input.classList.add('hidden');
  el('readerPageCurrentBtn').classList.remove('hidden');
}

function scheduleProgressSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const { error } = await updateProgress(bookId, currentPage);
    if (error) showToast("Progress didn't save — check your connection.", 'error');
  }, 700);
}

function goToPage(num) {
  const clamped = Math.min(Math.max(1, num), totalPages);
  if (clamped === currentPage) return;
  renderPage(clamped);
}
const nextPage = () => goToPage(currentPage + 1);
const prevPage = () => goToPage(currentPage - 1);

function updateZoomLabel() {
  el('readerZoomLabel').textContent = `${Math.round(scale * 100)}%`;
}
function zoomIn() {
  fitMode = null;
  updateFitButtons();
  scale = ZOOM_STEPS.find((s) => s > scale + 0.001) || ZOOM_STEPS[ZOOM_STEPS.length - 1];
  updateZoomLabel();
  renderPage(currentPage);
}
function zoomOut() {
  fitMode = null;
  updateFitButtons();
  scale = [...ZOOM_STEPS].reverse().find((s) => s < scale - 0.001) || ZOOM_STEPS[0];
  updateZoomLabel();
  renderPage(currentPage);
}

function toggleReadingMode() {
  darkReadingMode = !darkReadingMode;
  el('pdfCanvas').classList.toggle('reader-invert', darkReadingMode);
  el('readerDarkToggle').classList.toggle('active', darkReadingMode);
  localStorage.setItem(DARK_READ_KEY, darkReadingMode ? '1' : '0');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

function startSessionTimer() {
  setInterval(() => {
    const elapsed = Date.now() - sessionStart;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed % 60000) / 1000);
    el('readerTimer').textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  }, 1000);
  setInterval(checkpointSession, 60000); // log real progress periodically, not just at the end
}

function checkpointSession() {
  const now = Date.now();
  const minutes = Math.floor((now - lastLoggedAt) / 60000);
  if (minutes >= 1) {
    logReadingSession(bookId, minutes);
    lastLoggedAt = now;
  }
}

/* ---------------------------------------------------------------------- *
 * Interaction wiring
 * ---------------------------------------------------------------------- */
el('readerBackBtn').addEventListener('click', goBack);
el('readerErrorBackBtn').addEventListener('click', goBack);
el('prevPageBtn').addEventListener('click', prevPage);
el('nextPageBtn').addEventListener('click', nextPage);
el('zoomInBtn').addEventListener('click', zoomIn);
el('zoomOutBtn').addEventListener('click', zoomOut);
el('fitWidthBtn').addEventListener('click', () => setFitMode('width'));
el('fitPageBtn').addEventListener('click', () => setFitMode('page'));
el('readerDarkToggle').addEventListener('click', toggleReadingMode);
el('readerFullscreenBtn').addEventListener('click', toggleFullscreen);
el('readerPageCurrentBtn').addEventListener('click', openPageEdit);
el('readerPageCurrentInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); closePageEdit(true); }
  else if (e.key === 'Escape') { e.preventDefault(); closePageEdit(false); }
});
el('readerPageCurrentInput').addEventListener('blur', () => closePageEdit(true));

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'PageDown') nextPage();
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prevPage();
  else if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
});

// Tap zones: left third = previous page, right third = next, middle = toggle the bar (mobile-friendly)
el('readerViewport').addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  const rect = el('readerViewport').getBoundingClientRect();
  const x = e.clientX - rect.left;
  if (x < rect.width * 0.3) prevPage();
  else if (x > rect.width * 0.7) nextPage();
  else el('readerBar').classList.toggle('reader-bar-hidden');
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => {
    if (!pdfDoc) return;
    if (fitMode === 'page') await fitToPage();
    else if (fitMode === 'width') await fitToWidth();
    else return; // user has manually zoomed — leave their chosen scale alone
    renderPage(currentPage);
  }, 250);
});

window.addEventListener('beforeunload', () => {
  clearTimeout(saveTimer);
  if (bookId) updateProgress(bookId, currentPage);
  checkpointSession();
  pdfDoc?.destroy();
});

boot();
