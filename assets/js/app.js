// ════════════════════════════════════════════════════════════════════════
// APP — shared shell controller (nav, theme, auth modal). Every page in the
// app includes this file. Page-specific logic (e.g. home.js) lives separately
// and imports `showToast` from toast.js the same way this file does.
// ════════════════════════════════════════════════════════════════════════
import { getSession, onAuthChange, signIn, signUp, signOut, resetPassword, friendlyAuthError } from './auth.js';
import { showToast } from './toast.js';

/* ---------------------------------------------------------------------- *
 * Inline icons (no icon-font / extra request needed)
 * ---------------------------------------------------------------------- */
const ICON_SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7"/></svg>`;
const ICON_MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>`;
const ICON_EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>`;
const ICON_EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 10.7a2.8 2.8 0 0 0 3.9 3.9M6.2 6.6C4 8.1 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.5 4.4-1.2M9.9 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a13.7 13.7 0 0 1-2.6 3.4"/></svg>`;

/* ---------------------------------------------------------------------- *
 * Theme
 * ---------------------------------------------------------------------- */
const THEME_KEY = 'bp2-theme';
const themeToggle = document.getElementById('themeToggle');

function applyTheme(theme) {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  themeToggle.innerHTML = theme === 'light' ? ICON_MOON : ICON_SUN;
  themeToggle.title = theme === 'light' ? 'Switch to dark' : 'Switch to light';
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}
applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');
themeToggle.addEventListener('click', toggleTheme);


/* ---------------------------------------------------------------------- *
 * Nav auth state
 * ---------------------------------------------------------------------- */
const signInBtn = document.getElementById('signInBtn');
const heroSignInBtn = document.getElementById('heroSignInBtn');
const accountChip = document.getElementById('accountChip');
const avatarInitial = document.getElementById('avatarInitial');
const accountEmail = document.getElementById('accountEmail');
const signOutBtnNav = document.getElementById('signOutBtnNav');

function renderAuthUI(session) {
  const signedIn = !!session;
  signInBtn.classList.toggle('hidden', signedIn);
  accountChip.classList.toggle('hidden', !signedIn);
  signOutBtnNav.classList.toggle('hidden', !signedIn);
  if (signedIn) {
    const email = session.user.email || '';
    accountEmail.textContent = email;
    avatarInitial.textContent = email.charAt(0).toUpperCase();
  }
}
getSession().then(renderAuthUI).catch(() => {});
onAuthChange((_event, session) => renderAuthUI(session));

signOutBtnNav.addEventListener('click', async () => {
  await signOut();
  showToast('Signed out. Your books stay saved locally on this device.', 'info');
});

/* ---------------------------------------------------------------------- *
 * Modal open / close + focus handling
 * ---------------------------------------------------------------------- */
const backdrop = document.getElementById('authBackdrop');
const modalEl = backdrop.querySelector('.modal');
const closeBtn = document.getElementById('authCloseBtn');
const tabsView = document.getElementById('authTabsView');
const forgotView = document.getElementById('authForgotView');
const successView = document.getElementById('authSuccessView');

function showView(view) {
  tabsView.classList.toggle('hidden', view !== 'tabs');
  forgotView.classList.toggle('hidden', view !== 'forgot');
  successView.classList.toggle('hidden', view !== 'success');
}
function openModal() {
  showView('tabs');
  setTab('signin');
  backdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('siEmail').focus(), 260);
}
function closeModal() {
  backdrop.classList.remove('open');
  document.body.style.overflow = '';
  clearErrors();
}
[signInBtn, heroSignInBtn].filter(Boolean).forEach((btn) => btn.addEventListener('click', openModal));
closeBtn.addEventListener('click', closeModal);
backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && backdrop.classList.contains('open')) closeModal();
});
// Lightweight focus trap so Tab never escapes the modal while it's open
backdrop.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const focusables = Array.from(backdrop.querySelectorAll('button, input')).filter(
    (el) => el.offsetParent !== null && !el.disabled
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ---------------------------------------------------------------------- *
 * Tabs (sign in / create account)
 * ---------------------------------------------------------------------- */
const signinForm = document.getElementById('signinForm');
const signupForm = document.getElementById('signupForm');
const tabButtons = document.querySelectorAll('.auth-tab');
function setTab(tab) {
  tabButtons.forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.style.background = active ? 'var(--accent)' : 'transparent';
    b.style.color = active ? 'var(--text-on-accent)' : 'var(--text-secondary)';
  });
  signinForm.classList.toggle('hidden', tab !== 'signin');
  signupForm.classList.toggle('hidden', tab !== 'signup');
}
tabButtons.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

/* ---------------------------------------------------------------------- *
 * Password visibility toggles
 * ---------------------------------------------------------------------- */
document.querySelectorAll('.field-toggle[data-toggle-for]').forEach((btn) => {
  btn.innerHTML = ICON_EYE;
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.toggleFor);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = show ? ICON_EYE_OFF : ICON_EYE;
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
});

/* ---------------------------------------------------------------------- *
 * Validation helpers
 * ---------------------------------------------------------------------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function setFieldError(inputEl, errorEl, message) {
  if (message) {
    inputEl.classList.add('has-error');
    errorEl.querySelector('span').textContent = message;
    errorEl.classList.add('show');
  } else {
    inputEl.classList.remove('has-error');
    errorEl.classList.remove('show');
  }
}
function showServerError(el, message) {
  el.textContent = message;
  el.classList.remove('hidden');
}
function clearErrors() {
  document.querySelectorAll('.field-error').forEach((e) => e.classList.remove('show'));
  document.querySelectorAll('.input').forEach((e) => e.classList.remove('has-error'));
  document.querySelectorAll('[data-server-error]').forEach((e) => { e.classList.add('hidden'); e.textContent = ''; });
}
function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle('is-loading', loading);
}
function shakeModal() {
  modalEl.classList.remove('shake');
  void modalEl.offsetWidth; // force reflow so the animation can restart
  modalEl.classList.add('shake');
}

/* ---------------------------------------------------------------------- *
 * Sign in
 * ---------------------------------------------------------------------- */
const siEmail = document.getElementById('siEmail');
const siPassword = document.getElementById('siPassword');
const siEmailErr = document.getElementById('siEmailErr');
const siPasswordErr = document.getElementById('siPasswordErr');
const siServerError = document.getElementById('siServerError');
const siSubmit = document.getElementById('siSubmit');

signinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  siServerError.classList.add('hidden');
  let valid = true;
  if (!EMAIL_RE.test(siEmail.value.trim())) { setFieldError(siEmail, siEmailErr, 'Enter a valid email address.'); valid = false; }
  else setFieldError(siEmail, siEmailErr, null);
  if (siPassword.value.length < 6) { setFieldError(siPassword, siPasswordErr, 'Password must be at least 6 characters.'); valid = false; }
  else setFieldError(siPassword, siPasswordErr, null);
  if (!valid) return;

  setLoading(siSubmit, true);
  const { error } = await signIn(siEmail.value.trim(), siPassword.value);
  setLoading(siSubmit, false);
  if (error) {
    showServerError(siServerError, friendlyAuthError(error.message));
    shakeModal();
    return;
  }
  closeModal();
  showToast('Welcome back!', 'success');
});

/* ---------------------------------------------------------------------- *
 * Sign up
 * ---------------------------------------------------------------------- */
const suName = document.getElementById('suName');
const suEmail = document.getElementById('suEmail');
const suPassword = document.getElementById('suPassword');
const suConfirm = document.getElementById('suConfirm');
const suEmailErr = document.getElementById('suEmailErr');
const suPasswordErr = document.getElementById('suPasswordErr');
const suConfirmErr = document.getElementById('suConfirmErr');
const suServerError = document.getElementById('suServerError');
const suSubmit = document.getElementById('suSubmit');
const suStrength = document.getElementById('suStrength');
const suStrengthLabel = document.getElementById('suStrengthLabel');

function scorePassword(pw) {
  let score = pw.length >= 6 ? 1 : 0;
  if (pw.length >= 10 && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) score = 2;
  if (pw.length >= 12 && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score = 3;
  return score;
}
const STRENGTH_LABEL = ['', 'Weak', 'Good', 'Strong'];
suPassword.addEventListener('input', () => {
  const score = scorePassword(suPassword.value);
  suStrength.dataset.level = String(score);
  suStrengthLabel.textContent = suPassword.value ? STRENGTH_LABEL[score] : '\u00A0';
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  suServerError.classList.add('hidden');
  let valid = true;
  if (!EMAIL_RE.test(suEmail.value.trim())) { setFieldError(suEmail, suEmailErr, 'Enter a valid email address.'); valid = false; }
  else setFieldError(suEmail, suEmailErr, null);
  if (suPassword.value.length < 6) { setFieldError(suPassword, suPasswordErr, 'Use at least 6 characters.'); valid = false; }
  else setFieldError(suPassword, suPasswordErr, null);
  if (!suConfirm.value || suConfirm.value !== suPassword.value) { setFieldError(suConfirm, suConfirmErr, "Passwords don't match."); valid = false; }
  else setFieldError(suConfirm, suConfirmErr, null);
  if (!valid) return;

  setLoading(suSubmit, true);
  const metadata = suName.value.trim() ? { display_name: suName.value.trim() } : {};
  const { data, error } = await signUp(suEmail.value.trim(), suPassword.value, metadata);
  setLoading(suSubmit, false);
  if (error) {
    showServerError(suServerError, friendlyAuthError(error.message));
    shakeModal();
    return;
  }
  if (data.session) {
    closeModal();
    showToast("Account created — you're in!", 'success');
  } else {
    showView('success');
  }
});

/* ---------------------------------------------------------------------- *
 * Forgot password
 * ---------------------------------------------------------------------- */
const forgotBtn = document.getElementById('forgotBtn');
const forgotBackBtn = document.getElementById('forgotBackBtn');
const forgotForm = document.getElementById('forgotForm');
const forgotEmail = document.getElementById('forgotEmail');
const forgotSubmit = document.getElementById('forgotSubmit');
const forgotMsg = document.getElementById('forgotMsg');

forgotBtn.addEventListener('click', () => {
  showView('forgot');
  forgotForm.classList.remove('hidden');
  forgotMsg.classList.add('hidden');
  forgotEmail.focus();
});
forgotBackBtn.addEventListener('click', () => showView('tabs'));
forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!EMAIL_RE.test(forgotEmail.value.trim())) return;
  setLoading(forgotSubmit, true);
  await resetPassword(forgotEmail.value.trim());
  setLoading(forgotSubmit, false);
  forgotForm.classList.add('hidden');
  forgotMsg.classList.remove('hidden');
});

/* ---------------------------------------------------------------------- *
 * Success / check-email view
 * ---------------------------------------------------------------------- */
document.getElementById('successCloseBtn').addEventListener('click', closeModal);
