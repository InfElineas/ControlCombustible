import { appEnv, isSupabaseConfigured } from '@/config/env';
import { createLocalRepository } from '@/api/repositories/localRepository';
import { createSupabaseRepository } from '@/api/repositories/supabaseRepository';

const ENTITY_MAP = {
  Tarjeta: 'tarjetas',
  Vehiculo: 'vehiculos',
  TipoCombustible: 'combustibles',
  PrecioCombustible: 'precios_combustible',
  Movimiento: 'movimientos',
};

const useSupabase = appEnv.dataMode === 'supabase' && isSupabaseConfigured;

function createEntity(tableName) {
  return useSupabase ? createSupabaseRepository(tableName) : createLocalRepository(tableName);
}

export const base44 = {
  entities: Object.fromEntries(Object.entries(ENTITY_MAP).map(([name, table]) => [name, createEntity(table)])),
  auth: {
    async me() {
      if (!useSupabase) {
        return { id: 'local-user', role: 'admin', full_name: 'Administrador' };
      }

      const response = await fetch(`${appEnv.supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: appEnv.supabaseAnonKey,
          Authorization: `Bearer ${appEnv.supabaseAnonKey}`,
        },
      });

      if (!response.ok) {
        throw new Error('No se pudo recuperar el usuario autenticado en Supabase.');
      }

      const user = await response.json();
      return {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email,
        role: user.user_metadata?.role || 'operador',
      };
    },
    async logout() {
      if (!useSupabase) return;
      await fetch(`${appEnv.supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: appEnv.supabaseAnonKey,
          Authorization: `Bearer ${appEnv.supabaseAnonKey}`,
        },
      });
    },
    redirectToLogin(redirectTo = window.location.href) {
      if (!useSupabase) return;
      const params = new URLSearchParams({
        provider: 'google',
        redirect_to: redirectTo,
      });
      window.location.href = `${appEnv.supabaseUrl}/auth/v1/authorize?${params.toString()}`;
    },
  },
};

export const dataBackend = useSupabase ? 'supabase' : 'local';
