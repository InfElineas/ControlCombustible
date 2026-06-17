import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

export function useUserRole() {
  const [user, setUser]       = useState(/** @type {any} */(null));
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        if (active) setLoading(false);
        return;
      }

      // Obtener rol; si no existe la fila se crea con 'auditor' por defecto
      let { data: roleRow } = await supabase
        .from('user_roles')
        .select('role, full_name')
        .eq('user_id', authUser.id)
        .single();

      if (!roleRow) {
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (active) { setUser(null); setRole(null); setLoading(false); }
        return;
      }
      // Cualquier otro evento (SIGNED_IN, TOKEN_REFRESHED, INITIAL_SESSION, etc.)
      // recarga silenciosamente sin mostrar el spinner de carga.
      loadUser();
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
  };
}
