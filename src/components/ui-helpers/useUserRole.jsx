import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

// Último rol conocido, para que la aplicación arranque con los permisos
// correctos cuando no hay red. Se guarda junto al correo para no aplicar el rol
// de un usuario a otro que entre en el mismo dispositivo.
const CLAVE_ROL = 'webcombustible-rol-conocido';

function guardarRolConocido(email, fila) {
  try {
    localStorage.setItem(CLAVE_ROL, JSON.stringify({
      email, role: fila.role, status: fila.status, full_name: fila.full_name,
    }));
  } catch { /* almacenamiento lleno o bloqueado: se seguirá pidiendo al servidor */ }
}

function leerRolConocido(email) {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_ROL) || 'null');
    return guardado?.email === email ? guardado : null;
  } catch {
    return null;
  }
}

export function olvidarRolConocido() {
  try { localStorage.removeItem(CLAVE_ROL); } catch { /* nada que limpiar */ }
}

export function useUserRole() {
  const [user, setUser]       = useState(/** @type {any} */(null));
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadUser(session) {
      const authUser = session?.user;
      if (!authUser) {
        if (active) setLoading(false);
        return;
      }

      // RPC con SECURITY DEFINER: bypasea RLS, obtiene o crea la fila del usuario.
      // Evita la dependencia circular donde leer el rol requiere conocer el rol.
      const { data: roleRow } = await supabase.rpc('get_or_create_user_role', {
        p_email:     authUser.email,
        p_full_name: authUser.user_metadata?.full_name ?? authUser.email,
      });

      // Sin respuesta del servidor —normalmente por falta de conexión— se usa el
      // último rol conocido de este mismo usuario. Sin esto la aplicación abría
      // degradada a auditor y el operador perdía su menú y sus permisos.
      //
      // Solo afecta a lo que se muestra: el servidor sigue aplicando sus propias
      // reglas con el rol real, así que manipular este valor no da acceso a nada,
      // únicamente a ver botones que fallarían al usarse.
      let fila = roleRow;
      if (fila) {
        guardarRolConocido(authUser.email, fila);
      } else {
        fila = leerRolConocido(authUser.email);
      }

      const rolCrudo = fila?.role ?? 'auditor';
      const normalizedRole = rolCrudo === 'admin' ? 'superadmin' : rolCrudo;
      const status = fila?.status ?? 'active';
      if (active) {
        setUser({
          id:        authUser.id,
          email:     authUser.email,
          full_name: fila?.full_name ?? authUser.user_metadata?.full_name ?? authUser.email,
          role:      normalizedRole,
          status,
        });
        setRole(normalizedRole);
        setLoading(false);
      }
    }

    // onAuthStateChange dispara INITIAL_SESSION en el próximo tick con el estado
    // real de la sesión — más confiable que llamar getSession() en el mount, que
    // puede devolver null durante la inicialización y causar un boot prematuro.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') {
        setUser(null); setRole(null); setLoading(false);
        return;
      }
      loadUser(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const isSuperAdmin  = role === 'superadmin';
  const isOperador    = role === 'operador';
  const isAuditor     = role === 'auditor';
  const isEconomico   = role === 'economico';
  const isCajero      = role === 'cajero';
  const isAdmin       = isSuperAdmin;

  return {
    user,
    role,
    loading,
    isAdmin,
    isSuperAdmin,
    isPending:   user?.status === 'pending',
    isDisabled:  user?.status === 'disabled',
    isOperador,
    isAuditor,
    isEconomico,
    isCajero,
    canWrite:               isSuperAdmin || isOperador,
    canManageCatalogos:     isSuperAdmin || isOperador,
    canManageFlota:         isSuperAdmin || isOperador,
    canManageConductores:   isSuperAdmin || isOperador,
    canImport:              isSuperAdmin || isOperador,
    canViewReportes:        isSuperAdmin || isOperador || isAuditor || isEconomico,
    // RLS restringe DELETE de consumidor/conductor/asignacion_ruta/movimiento a
    // superadmin: incluir operador aquí solo mostraba botones que siempre fallaban.
    canDelete:              isSuperAdmin,
    canRead:                isSuperAdmin || isOperador || isAuditor || isEconomico,
    // Finanzas: recargas de tarjetas, precios, saldos
    canViewFinanzas:        isSuperAdmin || isEconomico || isAuditor,
    canManageFinanzas:      isSuperAdmin || isEconomico,
    // Movimientos: qué tipos puede registrar cada rol
    canRecargar:            isSuperAdmin || isEconomico,
    canDepositar:           isSuperAdmin || isOperador || isEconomico,
    canComprar:             isSuperAdmin || isOperador,
    canDespachar:           isSuperAdmin || isOperador,
    canComprarDespachar:    isSuperAdmin || isOperador,
    // Ventas trabajadores
    canVerVentas:           isSuperAdmin || isOperador || isEconomico || isAuditor || isCajero,
    // operador queda fuera: pageRoles.Ventas no lo incluye, así que nunca alcanza
    // la página y estos flags eran letra muerta.
    canRegistrarVentas:     isSuperAdmin || isCajero,
    canCobrarVentas:        isSuperAdmin || isEconomico || isCajero,
    canGestionarBeneficiarios: isSuperAdmin || isCajero,
    canVerPrecios:             isSuperAdmin || isEconomico || isAuditor,
  };
}
