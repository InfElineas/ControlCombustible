import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

export function useUserRole() {
  const [user, setUser]       = useState(/** @type {any} */(null));
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadUser(sessionArg) {
      // getSession() lee localStorage sin adquirir Web Lock — evita contención
      // cuando múltiples componentes montan useUserRole() simultáneamente.
      const authUser = sessionArg?.user
        ?? (await supabase.auth.getSession()).data.session?.user;
      if (!authUser) {
        if (active) setLoading(false);
        return;
      }

      // Obtener rol; si no existe la fila se crea con 'auditor' por defecto
      let { data: roleRow, error: selectError } = await supabase
        .from('user_roles')
        .select('role, full_name')
        .eq('user_id', authUser.id)
        .single();

      if (!roleRow && selectError?.code === 'PGRST116') {
        // Fila no existe — intentar crear con rol por defecto
        const { data: created } = await supabase
          .from('user_roles')
          .insert({
            user_id:   authUser.id,
            email:     authUser.email,
            full_name: authUser.user_metadata?.full_name ?? authUser.email,
            role:      'auditor',
          })
          .select('role, full_name')
          .single();
        roleRow = created;
      }
      // Si selectError es 401/403 (RLS) no reintentar — usar 'auditor' por defecto

      const normalizedRole = (roleRow?.role ?? 'auditor') === 'admin' ? 'superadmin' : (roleRow?.role ?? 'auditor');
      if (active) {
        setUser({
          id:        authUser.id,
          email:     authUser.email,
          full_name: roleRow?.full_name ?? authUser.user_metadata?.full_name ?? authUser.email,
          role:      normalizedRole,
        });
        setRole(normalizedRole);
        setLoading(false);
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (active) { setUser(null); setRole(null); setLoading(false); }
        return;
      }
      // Pasar la sesión del evento para evitar una nueva llamada getSession()
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
    canDelete:              isSuperAdmin || isOperador,
    canRead:                isSuperAdmin || isOperador || isAuditor || isEconomico,
    // Finanzas: recargas de tarjetas, precios, saldos
    canManageFinanzas:      isSuperAdmin || isEconomico,
    // Movimientos: qué tipos puede registrar cada rol
    canRecargar:            isSuperAdmin || isEconomico,
    canDepositar:           isSuperAdmin || isOperador || isEconomico,
    canComprar:             isSuperAdmin || isOperador,
    canDespachar:           isSuperAdmin || isOperador,
    canComprarDespachar:    isSuperAdmin || isOperador,
    // Ventas trabajadores
    canVerVentas:           isSuperAdmin || isOperador || isEconomico || isAuditor || isCajero,
    canRegistrarVentas:     isSuperAdmin || isOperador || isCajero,
    canCobrarVentas:        isSuperAdmin || isEconomico || isCajero,
    canGestionarBeneficiarios: isSuperAdmin || isOperador || isCajero,
    canVerPrecios:             isSuperAdmin || isEconomico || isAuditor,
  };
}
