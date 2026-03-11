import { appEnv, isSupabaseConfigured, isSupabaseMode, supabaseConfigIssue } from '@/config/env';
import { createLocalRepository } from '@/api/repositories/localRepository';
import { createSupabaseRepository } from '@/api/repositories/supabaseRepository';

const ENTITY_MAP = {
  Tarjeta: 'tarjetas',
  Vehiculo: 'vehiculos',
  TipoCombustible: 'combustibles',
  PrecioCombustible: 'precios_combustible',
  Movimiento: 'movimientos',
};

const AUTH_TOKEN_KEY = 'ff_supabase_access_token';

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function isValidSupabaseUrl(url) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);
}

const normalizedSupabaseUrl = normalizeUrl(appEnv.supabaseUrl);
const useSupabase = isSupabaseMode && isSupabaseConfigured && isValidSupabaseUrl(normalizedSupabaseUrl);

function createEntity(tableName) {
  return useSupabase ? createSupabaseRepository(tableName, getAccessToken, AUTH_TOKEN_KEY) : createLocalRepository(tableName);
}

function readAccessTokenFromHash() {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash?.replace(/^#/, '');
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  if (!token) return null;

  localStorage.setItem(AUTH_TOKEN_KEY, token);
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  return token;
}

function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return readAccessTokenFromHash() || localStorage.getItem(AUTH_TOKEN_KEY);
}


async function fetchUserProfile(userId, token) {
  const params = new URLSearchParams({
    select: 'role,full_name',
    user_id: `eq.${userId}`,
    limit: '1',
  });

  const response = await fetch(`${normalizedSupabaseUrl}/rest/v1/perfiles?${params.toString()}`, {
    headers: {
      apikey: appEnv.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return rows?.[0] || null;
}


async function fetchCurrentUserRole(token) {
  const response = await fetch(`${normalizedSupabaseUrl}/rest/v1/rpc/current_user_role`, {
    method: 'POST',
    headers: {
      apikey: appEnv.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);
  return typeof payload === 'string' ? payload : null;
}

async function requestAuth(path, options = {}) {
  const response = await fetch(`${normalizedSupabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: appEnv.supabaseAnonKey,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = payload?.msg || payload?.error_description || payload?.error || payload?.message;
    throw new Error(details ? `${details} (status ${response.status})` : `Error auth (${response.status})`);
  }
  return payload;
}

function ensureSupabaseReady() {
  if (useSupabase) return;
  if (isSupabaseMode) {
    throw new Error(supabaseConfigIssue || 'Configuración de Supabase incompleta en .env.local');
  }
}

export const base44 = {
  entities: Object.fromEntries(Object.entries(ENTITY_MAP).map(([name, table]) => [name, createEntity(table)])),
  auth: {
    isSupabaseEnabled: useSupabase,
    isSupabaseMode,
    supabaseConfigIssue,
    async me() {
      if (!useSupabase) {
        ensureSupabaseReady();
        return { id: 'local-user', role: 'admin', full_name: 'Administrador' };
      }

      const token = getAccessToken();
      if (!token) {
        throw new Error('No hay sesión activa en Supabase. Inicia sesión para continuar.');
      }

      const response = await fetch(`${normalizedSupabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: appEnv.supabaseAnonKey,
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          throw new Error('La sesión expiró o es inválida. Vuelve a iniciar sesión.');
        }
        throw new Error(`No se pudo recuperar el usuario en Supabase (${response.status}).`);
      }

      const user = await response.json();
      const profile = await fetchUserProfile(user.id, token);
      const resolvedRole = profile?.role || await fetchCurrentUserRole(token) || user.user_metadata?.role || 'operador';

      return {
        id: user.id,
        email: user.email,
        full_name: profile?.full_name || user.user_metadata?.full_name || user.email,
        role: resolvedRole,
      };
    },
    async signInWithPassword({ email, password }) {
      if (!useSupabase) {
        ensureSupabaseReady();
        return { id: 'local-user', email: 'local@fuel.flow', role: 'admin', full_name: 'Administrador' };
      }

      const data = await requestAuth('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (data?.access_token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
      }
      return data;
    },
    async signUpWithPassword({ email, password, fullName }) {
      if (!useSupabase) {
        ensureSupabaseReady();
        return { user: { id: 'local-user', email }, session: { access_token: 'local-token' } };
      }

      const data = await requestAuth('/auth/v1/signup', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          data: {
            full_name: fullName || email,
          },
        }),
      });

      if (data?.access_token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
      } else if (data?.session?.access_token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.session.access_token);
      }

      return data;
    },
    async logout() {
      if (!useSupabase) {
        ensureSupabaseReady();
        return;
      }
      const token = getAccessToken();
      if (token) {
        await fetch(`${normalizedSupabaseUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            apikey: appEnv.supabaseAnonKey,
            Authorization: `Bearer ${token}`,
          },
        });
      }
      localStorage.removeItem(AUTH_TOKEN_KEY);
    },
    redirectToLogin(redirectTo = window.location.href) {
      if (!useSupabase) {
        ensureSupabaseReady();
        return;
      }

      if (!isValidSupabaseUrl(normalizedSupabaseUrl)) {
        throw new Error('VITE_SUPABASE_URL inválida. Usa el dominio real de tu proyecto: https://<project-ref>.supabase.co');
      }

      const params = new URLSearchParams({
        provider: 'google',
        redirect_to: redirectTo,
      });
      window.location.href = `${normalizedSupabaseUrl}/auth/v1/authorize?${params.toString()}`;
    },
  },
};

export const dataBackend = useSupabase ? 'supabase' : 'local';
