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
const LOCAL_USERS_KEY = 'ff_local_users';
const LOCAL_SESSION_KEY = 'ff_local_session_user_id';

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function isValidSupabaseUrl(url) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);
}

function safeLocalStorageGet(key) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignorar errores de almacenamiento para evitar romper auth por restricciones del navegador.
  }
}

function safeLocalStorageRemove(key) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignorar errores de almacenamiento para evitar romper auth por restricciones del navegador.
  }
}

function readLocalUsers() {
  const raw = safeLocalStorageGet(LOCAL_USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalUsers(users) {
  safeLocalStorageSet(LOCAL_USERS_KEY, JSON.stringify(users));
}

function createLocalUser({ email, password, fullName, role }) {
  const now = new Date().toISOString();
  const localRole = role || 'auditor';
  return {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    email: String(email || '').trim().toLowerCase(),
    password: String(password || ''),
    full_name: fullName || email,
    role: localRole,
    created_date: now,
  };
}

function saveLocalSession(userId) {
  safeLocalStorageSet(LOCAL_SESSION_KEY, userId);
  safeLocalStorageSet(AUTH_TOKEN_KEY, `local-token-${userId}`);
}

function clearLocalSession() {
  safeLocalStorageRemove(LOCAL_SESSION_KEY);
  safeLocalStorageRemove(AUTH_TOKEN_KEY);
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

  safeLocalStorageSet(AUTH_TOKEN_KEY, token);
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  return token;
}

function getAccessToken() {
  if (typeof window === 'undefined') return null;
  return readAccessTokenFromHash() || safeLocalStorageGet(AUTH_TOKEN_KEY);
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
        const userId = safeLocalStorageGet(LOCAL_SESSION_KEY);
        if (!userId) {
          throw new Error('No hay sesión activa en modo local. Inicia sesión para continuar.');
        }

        const user = readLocalUsers().find((candidate) => candidate.id === userId);
        if (!user) {
          clearLocalSession();
          throw new Error('La sesión local no es válida. Inicia sesión nuevamente.');
        }

        return {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role || 'auditor',
        };
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
          safeLocalStorageRemove(AUTH_TOKEN_KEY);
          throw new Error('La sesión expiró o es inválida. Vuelve a iniciar sesión.');
        }
        throw new Error(`No se pudo recuperar el usuario en Supabase (${response.status}).`);
      }

      const user = await response.json();
      const profile = await fetchUserProfile(user.id, token);
      const resolvedRole = profile?.role || await fetchCurrentUserRole(token) || user.user_metadata?.role || 'auditor';

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
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const users = readLocalUsers();
        const user = users.find((candidate) => candidate.email === normalizedEmail);
        if (!user || user.password !== String(password || '')) {
          throw new Error('Correo o contraseña inválidos en modo local.');
        }
        saveLocalSession(user.id);
        return { access_token: `local-token-${user.id}`, user };
      }

      const data = await requestAuth('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (data?.access_token) {
        safeLocalStorageSet(AUTH_TOKEN_KEY, data.access_token);
      }
      return data;
    },
    async signUpWithPassword({ email, password, fullName }) {
      if (!useSupabase) {
        ensureSupabaseReady();
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedPassword = String(password || '').trim();
        if (!normalizedEmail || !normalizedPassword) {
          throw new Error('Correo y contraseña son obligatorios.');
        }

        const users = readLocalUsers();
        if (users.some((candidate) => candidate.email === normalizedEmail)) {
          throw new Error('Ese correo ya está registrado en modo local.');
        }

        const role = users.length === 0 ? 'superadmin' : 'auditor';
        const createdUser = createLocalUser({
          email: normalizedEmail,
          password: normalizedPassword,
          fullName,
          role,
        });
        writeLocalUsers([...users, createdUser]);
        saveLocalSession(createdUser.id);
        return { user: createdUser, session: { access_token: `local-token-${createdUser.id}` } };
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
        safeLocalStorageSet(AUTH_TOKEN_KEY, data.access_token);
      } else if (data?.session?.access_token) {
        safeLocalStorageSet(AUTH_TOKEN_KEY, data.session.access_token);
      }

      return data;
    },
    async logout() {
      if (!useSupabase) {
        ensureSupabaseReady();
        clearLocalSession();
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
      safeLocalStorageRemove(AUTH_TOKEN_KEY);
    },
    redirectToLogin(redirectTo = window.location.href) {
      if (!useSupabase) {
        ensureSupabaseReady();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
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
