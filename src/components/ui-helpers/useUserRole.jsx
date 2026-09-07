import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

// Último rol conocido, para que la aplicación arranque con los permisos
// correctos cuando no hay red. Se guarda junto al correo para no aplicar el rol
// de un usuario a otro que entre en el mismo dispositivo.
const CLAVE_ROL = 'webcombustible-rol-conocido';

function guardarRolConocido(authUser, fila) {
  try {
    localStorage.setItem(CLAVE_ROL, JSON.stringify({
      email: authUser.email, id: authUser.id,
      role: fila.role, status: fila.status, full_name: fila.full_name,
    }));
  } catch { /* almacenamiento lleno o bloqueado: se seguirá pidiendo al servidor */ }
}

function leerIdentidadGuardada() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ROL) || 'null');
  } catch {
    return null;
  }
}

function leerRolConocido(email) {
  const guardado = leerIdentidadGuardada();
  return guardado?.email === email ? guardado : null;
}

// ¿Queda en el dispositivo una sesión que Supabase no ha podido validar?
//
// Distingue "falta red para refrescar el token" de "aquí nadie ha entrado".
// Hace falta porque getSession() devuelve null en cuanto el token de acceso
// caduca —dura una hora— y el refresco falla: sin conexión eso pasa siempre, y
// la aplicación mandaba al usuario a la pantalla de inicio de sesión, donde sin
// red no puede hacer nada. Los datos descargados quedaban inalcanzables.
//
// La presencia de esta entrada es la señal de que la sesión sigue siendo
// legítima: cuando el token de refresco muere de verdad y hay conexión para
// comprobarlo, Supabase la borra él mismo al arrancar.
export function hayCredencialGuardada() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i) || '';
      if (/^sb-.+-auth-token$/.test(clave) && (localStorage.getItem(clave) || '').length > 20) {
        return true;
      }
    }
  } catch { /* almacenamiento bloqueado */ }
  return false;
}

// Plazo para las llamadas del arranque.
//
// Sin red, auth-js reintenta el refresco del token durante más de treinta
// segundos antes de rendirse, y la aplicación se quedaba todo ese rato en la
// pantalla de carga: cualquiera da por hecho que no funciona y la cierra. Se
// arranca con lo guardado en cuanto vence el plazo, y si la respuesta llega
// más tarde el estado se corrige solo.
// 1,8 s: con red, getSession() y el RPC del rol responden muy por debajo de eso,
// así que no se entra en modo sin conexión por error. El plazo se paga dos veces
// seguidas —primero en AuthContext, después aquí— porque el menú no se monta
// hasta que el primero cede.
export const ESPERA_MAXIMA_MS = 1800;

const SIN_RESPUESTA = Symbol('sin-respuesta');

function conLimite(promesa) {
  return Promise.race([
    Promise.resolve(promesa),
    new Promise(resolver => setTimeout(() => resolver(SIN_RESPUESTA), ESPERA_MAXIMA_MS)),
  ]);
}

export function olvidarRolConocido() {
  try { localStorage.removeItem(CLAVE_ROL); } catch { /* nada que limpiar */ }
}

export function useUserRole() {
  const [user, setUser]       = useState(/** @type {any} */(null));
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [sesionOffline, setSesionOffline] = useState(false);

  useEffect(() => {
    let active = true;
    // Deja de hacer falta el plazo en cuanto se sabe si hay sesión o no. Sin
    // esta marca el temporizador seguia disparando despues de una carga
    // correcta y volvia a encender el aviso de sesion sin validar aunque
    // hubiera conexion.
    let resuelto = false;
    let plazo;

    // Abre con el último usuario conocido cuando no hay sesión validada pero sí
    // credencial guardada en el dispositivo, para que los datos ya descargados
    // sigan siendo consultables. Es solo lectura: toda escritura necesita un
    // token que el servidor acepte.
    function abrirConLoGuardado() {
      const guardada = hayCredencialGuardada() ? leerIdentidadGuardada() : null;
      if (!guardada?.email || !active) return false;
      const rolGuardado = guardada.role === 'admin' ? 'superadmin' : (guardada.role ?? 'auditor');
      setUser({
        id:        guardada.id ?? null,
        email:     guardada.email,
        full_name: guardada.full_name ?? guardada.email,
        role:      rolGuardado,
        status:    guardada.status ?? 'active',
      });
      setRole(rolGuardado);
      setSesionOffline(true);
      setLoading(false);
      return true;
    }

    async function loadUser(session) {
      const authUser = session?.user;
      if (!authUser) {
        resuelto = true;
        clearTimeout(plazo);
        if (abrirConLoGuardado()) return;
        if (active) setLoading(false);
        return;
      }

      // Hay sesión validada: el plazo ya no debe encender nada, aunque la
      // consulta del rol que viene ahora tarde más que él.
      resuelto = true;
      clearTimeout(plazo);

      // RPC con SECURITY DEFINER: bypasea RLS, obtiene o crea la fila del usuario.
      // Evita la dependencia circular donde leer el rol requiere conocer el rol.
      const respuesta = await conLimite(supabase.rpc('get_or_create_user_role', {
        p_email:     authUser.email,
        p_full_name: authUser.user_metadata?.full_name ?? authUser.email,
      }));
      const roleRow = respuesta === SIN_RESPUESTA ? null : respuesta.data;

      // Sin respuesta del servidor —normalmente por falta de conexión— se usa el
      // último rol conocido de este mismo usuario. Sin esto la aplicación abría
      // degradada a auditor y el operador perdía su menú y sus permisos.
      //
      // Solo afecta a lo que se muestra: el servidor sigue aplicando sus propias
      // reglas con el rol real, así que manipular este valor no da acceso a nada,
      // únicamente a ver botones que fallarían al usarse.
      let fila = roleRow;
      if (fila) {
        guardarRolConocido(authUser, fila);
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
        setSesionOffline(false);
        setLoading(false);
      }
    }

    // onAuthStateChange dispara INITIAL_SESSION en el próximo tick con el estado
    // real de la sesión — más confiable que llamar getSession() en el mount, que
    // puede devolver null durante la inicialización y causar un boot prematuro.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') {
        resuelto = true;
        clearTimeout(plazo);
        setUser(null); setRole(null); setSesionOffline(false); setLoading(false);
        return;
      }
      loadUser(session);
    });

    // auth-js no emite INITIAL_SESSION hasta terminar sus reintentos de
    // refresco, así que sin red el arranque se decide aquí.
    plazo = setTimeout(() => {
      if (active && !resuelto) abrirConLoGuardado();
    }, ESPERA_MAXIMA_MS);

    return () => {
      active = false;
      clearTimeout(plazo);
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
    // Sesión recuperada del dispositivo sin validar contra el servidor: la
    // interfaz debe avisar de que no se puede guardar nada.
    sesionOffline,
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
