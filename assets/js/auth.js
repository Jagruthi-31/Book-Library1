// ════════════════════════════════════════════════════════════════════════
// AUTH — all Supabase auth calls live here, isolated from UI/DOM code.
// Pages import these functions instead of talking to `supabase.auth`
// directly, so the auth logic only has to be written once.
// ════════════════════════════════════════════════════════════════════════
import { supabase } from './supabase-client.js';

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** Subscribe to sign-in/sign-out events. Returns an unsubscribe function. */
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => data.subscription.unsubscribe();
}

export async function signUp(email, password, metadata = {}) {
  return supabase.auth.signUp({ email, password, options: { data: metadata } });
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function resetPassword(email) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
}

/** Friendlier copy for Supabase's raw error strings. */
export function friendlyAuthError(message = '') {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return "That email or password doesn't match our records.";
  if (m.includes('user already registered')) return 'An account with that email already exists — try signing in instead.';
  if (m.includes('password should be at least')) return 'Password needs to be at least 6 characters.';
  if (m.includes('email not confirmed')) return 'Please confirm your email before signing in — check your inbox.';
  if (m.includes('rate limit')) return 'Too many attempts — please wait a moment and try again.';
  return message || 'Something went wrong. Please try again.';
}
