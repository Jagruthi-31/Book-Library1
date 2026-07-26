// ════════════════════════════════════════════════════════════════════════
// PROGRESS EDIT — the small inline "tap the % to update your page" widget.
// Shared by home.js and library-page.js so this logic exists exactly once.
// ════════════════════════════════════════════════════════════════════════
import { updateProgress } from './books-data.js';
import { showToast } from './toast.js';

const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>`;

/**
 * @param {HTMLElement} card - the .book-card element containing the progress label
 * @param {object} book - the book record (needs id, pages, currentPage)
 * @param {() => void} onDone - called after a successful or failed save, to let the caller re-render
 */
export function startProgressEdit(card, book, onDone) {
  const labelBtn = card.querySelector('.book-progress-label');
  if (!labelBtn) return;
  const wrap = document.createElement('div');
  wrap.className = 'progress-edit';
  wrap.innerHTML = `<input type="number" min="0" max="${book.pages || 99999}" value="${book.currentPage || 0}" aria-label="Current page"/>
    <button type="button" class="progress-edit-confirm" aria-label="Save">${CHECK_ICON}</button>`;
  labelBtn.replaceWith(wrap);
  const input = wrap.querySelector('input');
  input.focus();
  input.select();

  const commit = async () => {
    const val = Math.max(0, Math.min(book.pages || 999999, parseInt(input.value, 10) || 0));
    const { error } = await updateProgress(book.id, val);
    if (error) showToast("Couldn't save that — check your connection and try again.", 'error');
    else showToast('Progress updated.', 'success');
    onDone();
  };
  wrap.querySelector('.progress-edit-confirm').addEventListener('click', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
}
