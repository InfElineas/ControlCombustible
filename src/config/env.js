const mode = (import.meta.env.VITE_DATA_MODE || 'local').toLowerCase();

export const appEnv = {
  dataMode: mode,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
};

export const isSupabaseConfigured = Boolean(appEnv.supabaseUrl && appEnv.supabaseAnonKey);
