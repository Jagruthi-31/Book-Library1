// ════════════════════════════════════════════════════════════════════════
// SHARED SUPABASE CLIENT
// Same project as V1 — no data migration needed. Your account, books, and
// PDFs all work immediately in V2 because this points at the same backend.
// Every page/module in the app imports `supabase` from here instead of
// creating its own client, so there's only ever one source of truth.
// ════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://nctmtedmxlmcmfhtyxyy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jdG10ZWRteGxtY21maHR5eHl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDIxODQsImV4cCI6MjA5NzE3ODE4NH0.Q5FmlMfWDJoY-uwfARubw7bnQ3Nf3-LmWLje5PryImE';

if (!window.supabase) {
  throw new Error('Supabase SDK not loaded — make sure the CDN <script> tag is included before this module.');
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
