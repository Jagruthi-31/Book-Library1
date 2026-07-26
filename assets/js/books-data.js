// ════════════════════════════════════════════════════════════════════════
// BOOKS DATA — reads/writes the exact same shape as V1:
//   Supabase table `books`: user_id, data (JSON string of the book array), goal, updated_at
//   Local fallback for when nobody's signed in.
//
// V2 intentionally uses its OWN local-storage keys (bp2_*) instead of V1's
// (bp_*). Both sites are served from the same github.io origin, so sharing
// keys would mean this app could silently read/overwrite V1's local data.
// Cloud data (Supabase) is shared on purpose — that's the same account.
// Local-only data is kept isolated on purpose — that's a safety boundary.
// ════════════════════════════════════════════════════════════════════════
import { supabase } from './supabase-client.js';
import { getSession } from './auth.js';

const LOCAL_LIBRARY_KEY = 'bp2_library';
const LOCAL_GOAL_KEY = 'bp2_goal';
const LOCAL_SESSIONS_KEY = 'bp2_sessions';

let library = [];
let goal = 0;
let sessions = []; // [{ date: 'YYYY-MM-DD', bookId, minutes }] — loaded separately, see loadSessions()

function sanitize(arr) {
  // Defensive only: older records occasionally carried huge inline base64
  // covers before Supabase Storage existed. Strip anything oversized rather
  // than let it bloat localStorage or slow down rendering.
  return (Array.isArray(arr) ? arr : []).map((b) =>
    b.cover && typeof b.cover === 'string' && b.cover.startsWith('data:') && b.cover.length > 100000
      ? { ...b, cover: '' }
      : b
  );
}

function loadLocal() {
  try { library = sanitize(JSON.parse(localStorage.getItem(LOCAL_LIBRARY_KEY) || '[]')); }
  catch { library = []; }
  goal = parseInt(localStorage.getItem(LOCAL_GOAL_KEY) || '0', 10) || 0;
}

function saveLocal() {
  try { localStorage.setItem(LOCAL_LIBRARY_KEY, JSON.stringify(library)); } catch { /* quota — cloud is the source of truth when signed in */ }
  localStorage.setItem(LOCAL_GOAL_KEY, String(goal));
}

/** Loads the library: from Supabase if signed in, from this device otherwise. Call once on page load. */
export async function loadLibrary() {
  loadLocal(); // always have something to show immediately, even before the network responds
  const session = await getSession();
  if (!session) return { library, goal, source: 'local' };

  try {
    const { data, error } = await supabase.from('books').select('data,goal').eq('user_id', session.user.id).single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no row yet, not a real failure
    if (data && data.data) {
      library = sanitize(JSON.parse(data.data));
      goal = data.goal || 0;
      saveLocal(); // mirror locally so the next load is instant even offline
    }
    return { library, goal, source: 'cloud' };
  } catch (err) {
    return { library, goal, source: 'local', error: err };
  }
}

export function getLibrary() { return library; }
export function getGoalValue() { return goal; }

async function persist() {
  saveLocal();
  const session = await getSession();
  if (!session) return { error: null };
  try {
    const { error } = await supabase.from('books').upsert(
      { user_id: session.user.id, data: JSON.stringify(library), goal, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    return { error };
  } catch (err) {
    return { error: err };
  }
}

export async function setGoal(newGoal) {
  goal = newGoal;
  return persist();
}

export async function updateProgress(id, currentPage) {
  library = library.map((b) => (b.id === id ? { ...b, currentPage } : b));
  return persist();
}

export async function toggleFavorite(id) {
  library = library.map((b) => (b.id === id ? { ...b, favourite: !b.favourite } : b));
  const result = await persist();
  return { ...result, favourite: library.find((b) => b.id === id)?.favourite };
}

/** Full edit — merges any subset of fields into the existing book record. */
export async function updateBook(id, changes) {
  library = library.map((b) => (b.id === id ? { ...b, ...changes } : b));
  return persist();
}

/** Adds a brand-new book. `book` should already include an id (see books-data.js callers). */
export async function addBook(book) {
  library = [book, ...library];
  return persist();
}

/**
 * Uploads a PDF to the same Storage bucket/path scheme V1 used: book-pdfs/{userId}/{bookId}.pdf
 * Requires an active session — PDFs are cloud-only, there's no local-file fallback.
 */
export async function uploadBookPdf(bookId, file) {
  const session = await getSession();
  if (!session) return { url: null, error: new Error('Sign in to attach a PDF.') };
  try {
    const path = `${session.user.id}/${bookId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('book-pdfs')
      .upload(path, file, { upsert: true, contentType: 'application/pdf' });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('book-pdfs').getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (err) {
    return { url: null, error: err };
  }
}

/** Permanently removes a book. Callers are responsible for confirming first. */
export async function deleteBook(id) {
  const existed = library.some((b) => b.id === id);
  library = library.filter((b) => b.id !== id);
  const result = await persist();
  return { ...result, existed };
}

/* ---------------------------------------------------------------------- *
 * Reading sessions (streak + reading hours) — Dashboard, Phase 5.
 *
 * This reads/writes a `sessions` column on the SAME `books` row. It is
 * DELIBERATELY isolated from loadLibrary()/persist() above: its own select,
 * its own update call, wrapped so that if the column doesn't exist yet (see
 * the migration note in the README) it fails silently and falls back to a
 * local-only log — it can never break loading or saving your actual books.
 * ---------------------------------------------------------------------- */
function loadLocalSessions() {
  try { return JSON.parse(localStorage.getItem(LOCAL_SESSIONS_KEY) || '[]'); } catch { return []; }
}
function saveLocalSessions() {
  try { localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions)); } catch { /* best-effort only */ }
}

export async function loadSessions() {
  sessions = loadLocalSessions();
  const session = await getSession();
  if (!session) return sessions;
  try {
    const { data, error } = await supabase.from('books').select('sessions').eq('user_id', session.user.id).single();
    if (error) throw error;
    if (data && data.sessions) sessions = JSON.parse(data.sessions);
  } catch {
    // Column may not exist yet, or the row/network isn't available — the
    // local copy loaded above is still perfectly usable.
  }
  return sessions;
}

export async function logReadingSession(bookId, minutes) {
  if (!minutes || minutes < 1) return;
  const today = new Date().toISOString().slice(0, 10);
  const existing = sessions.find((s) => s.date === today && s.bookId === bookId);
  if (existing) existing.minutes += minutes;
  else sessions.push({ date: today, bookId, minutes });
  saveLocalSessions();

  const session = await getSession();
  if (!session) return;
  try {
    await supabase.from('books').update({ sessions: JSON.stringify(sessions) }).eq('user_id', session.user.id);
  } catch {
    // Silent on purpose — losing a sync'd session log entry must never
    // interrupt or error out on the person while they're mid-book.
  }
}

/** Consecutive days with at least one reading session, allowing "haven't read yet today". */
export function getStreak() {
  const days = new Set(sessions.map((s) => s.date));
  if (!days.size) return 0;
  const fmt = (d) => d.toISOString().slice(0, 10);
  const cursor = new Date();
  if (!days.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(fmt(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function getReadingHours() {
  const totalMinutes = sessions.reduce((s, x) => s + x.minutes, 0);
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const monthMinutes = sessions.filter((s) => s.date.startsWith(thisMonthKey)).reduce((s, x) => s + x.minutes, 0);
  return { totalHours: totalMinutes / 60, monthHours: monthMinutes / 60 };
}

/* ---------------------------------------------------------------------- *
 * Year in Books + breakdown charts — Dashboard, Phase 5
 * ---------------------------------------------------------------------- */
export function getMonthlyFinished(year = new Date().getFullYear()) {
  const counts = Array(12).fill(0);
  library.forEach((b) => {
    if (b.status === 'Finished' && b.finished) {
      const d = new Date(b.finished);
      if (!Number.isNaN(d.getTime()) && d.getFullYear() === year) counts[d.getMonth()]++;
    }
  });
  return counts;
}

function breakdownBy(field) {
  const counts = {};
  library.forEach((b) => { const v = b[field]; if (v) counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
}
export function getGenreBreakdown() { return breakdownBy('genre'); }
export function getFormatBreakdown() { return breakdownBy('format'); }
export function getSourceBreakdown() { return breakdownBy('source'); }

/**
 * Books finished THIS CALENDAR YEAR against your goal — not all-time.
 * V1 (and Phase 2/3's carried-over math) counted every finished book ever,
 * which double-counts past years against a "yearly" goal. Corrected here,
 * deliberately, now that Year in Books needs year-scoping anyway. See the
 * README for why this was reproduced-then-fixed rather than changed silently.
 */
export function getYearlyGoalStats(year = new Date().getFullYear()) {
  const finishedThisYear = library.filter(
    (b) => b.status === 'Finished' && b.finished && new Date(b.finished).getFullYear() === year
  ).length;
  const pct = goal ? Math.min(100, Math.round((finishedThisYear / goal) * 100)) : 0;
  return { finishedThisYear, goal, pct, year };
}

/* ---------------------------------------------------------------------- *
 * Derived views — same math as V1 so the numbers match what you're used to
 * ---------------------------------------------------------------------- */
export function getStats() {
  const finished = library.filter((b) => b.status === 'Finished');
  const reading = library.filter((b) => b.status === 'Reading');
  const totalPages = finished.reduce((s, b) => s + (b.pages || 0), 0);
  const rated = finished.filter((b) => b.rating);
  const avgRating = rated.length ? rated.reduce((s, b) => s + b.rating, 0) / rated.length : null;
  const yearly = getYearlyGoalStats();
  return { total: library.length, finished: finished.length, reading: reading.length, totalPages, avgRating, goal, goalPct: yearly.pct };
}

export function getContinueReading() {
  return library
    .filter((b) => b.status === 'Reading')
    .map((b) => ({
      ...b,
      progressPct: b.pages && b.currentPage ? Math.min(100, Math.round((b.currentPage / b.pages) * 100)) : 0,
    }));
}

export function getRecentlyAdded(limit = 8) {
  return [...library].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, limit);
}

export function getFavorites(limit = 8) {
  return library.filter((b) => b.favourite).slice(0, limit);
}

export function getCategories(limit = 6) {
  const counts = {};
  library.forEach((b) => { if (b.genre) counts[b.genre] = (counts[b.genre] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([genre, count]) => ({ genre, count }));
}

/** Not a real "trending" (there's only one reader here) — instead, your own
 *  Want-to-Read pile, ranked by the genres you've actually rated highly. */
export function getRecommended(limit = 6) {
  const wishlist = library.filter((b) => b.status === 'Want to Read');
  if (!wishlist.length) return [];
  const genreScore = {};
  library.filter((b) => b.status === 'Finished' && b.rating).forEach((b) => {
    if (b.genre) genreScore[b.genre] = (genreScore[b.genre] || 0) + b.rating;
  });
  return [...wishlist].sort((a, b) => (genreScore[b.genre] || 0) - (genreScore[a.genre] || 0)).slice(0, limit);
}
