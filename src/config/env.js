const mode = (import.meta.env.VITE_DATA_MODE || 'local').toLowerCase();

const normalize = (value) => String(value || '').trim();

export const appEnv = {
  dataMode: mode,
  supabaseUrl: normalize(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: normalize(import.meta.env.VITE_SUPABASE_ANON_KEY),
};

export const isSupabaseMode = appEnv.dataMode === 'supabase';

const hasSupabaseUrl = Boolean(appEnv.supabaseUrl);
const hasSupabaseAnonKey = Boolean(appEnv.supabaseAnonKey);
const hasValidSupabaseUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(appEnv.supabaseUrl);

export const supabaseConfigIssue = !isSupabaseMode
  ? null
  : !hasSupabaseUrl
    ? 'Falta VITE_SUPABASE_URL en .env.local'
    : !hasValidSupabaseUrl
      ? 'VITE_SUPABASE_URL no es válida. Debe ser https://<project-ref>.supabase.co'
      : !hasSupabaseAnonKey
        ? 'Falta VITE_SUPABASE_ANON_KEY en .env.local'
        : null;

export const isSupabaseConfigured = !supabaseConfigIssue;
